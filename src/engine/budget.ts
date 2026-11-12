import { CATEGORIES, FIXED_COST_CATEGORIES, GROUP_IDEAL_PCT, GROUP_LABEL } from './categories';
import { currentMonthKey, daysInMonth, monthKey, shiftMonth } from './dates';
import type {
  Category,
  CategoryUsage,
  GroupUsage,
  LimitStatus,
  MonthSummary,
  Settings,
  Transaction,
} from './types';

const WARNING_RATIO = 0.8;

export function limitFor(cat: Category, baseIncomeCents: number, settings: Settings): number {
  const override = settings.budgetOverrides[cat.id];
  if (override !== undefined && override >= 0) return override;
  return Math.round((baseIncomeCents * cat.idealPct) / 100);
}

function statusFor(cat: Category, spent: number, limit: number, baseIncome: number): LimitStatus {
  // Sem renda de referência não há como julgar; poupar acima da meta é bom.
  if (baseIncome <= 0 || cat.group === 'poupanca') return 'ok';
  if (spent > limit) return 'over';
  if (limit > 0 && spent >= limit * WARNING_RATIO) return 'warning';
  return 'ok';
}

export function computeMonthSummary(
  txs: Transaction[],
  month: string,
  settings: Settings,
  now: Date = new Date(),
): MonthSummary {
  const monthTx = txs.filter((t) => monthKey(t.date) === month);

  let incomeCents = 0;
  const spentByCat = new Map<string, number>();
  for (const t of monthTx) {
    if (t.categoryId === 'transferencia') continue;
    if (t.type === 'income') incomeCents += t.amountCents;
    else spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amountCents);
  }

  const baseIncomeCents = settings.monthlyIncomeCents > 0 ? settings.monthlyIncomeCents : incomeCents;

  const categories: CategoryUsage[] = CATEGORIES.filter(
    (c) => c.group !== 'renda' && c.group !== 'ignorar',
  ).map((category) => {
    const spentCents = spentByCat.get(category.id) ?? 0;
    const limitCents = limitFor(category, baseIncomeCents, settings);
    const ratio = limitCents > 0 ? spentCents / limitCents : spentCents > 0 ? 2 : 0;
    return { category, spentCents, limitCents, ratio, status: statusFor(category, spentCents, limitCents, baseIncomeCents) };
  });

  const groupSpent = { necessidades: 0, desejos: 0, poupanca: 0 };
  for (const u of categories) {
    if (u.category.group === 'necessidades' || u.category.group === 'desejos' || u.category.group === 'poupanca') {
      groupSpent[u.category.group] += u.spentCents;
    }
  }

  const groups: GroupUsage[] = (['necessidades', 'desejos', 'poupanca'] as const).map((group) => {
    const idealPct = GROUP_IDEAL_PCT[group];
    return {
      group,
      label: GROUP_LABEL[group],
      idealPct,
      idealCents: Math.round((baseIncomeCents * idealPct) / 100),
      spentCents: groupSpent[group],
      actualPct: baseIncomeCents > 0 ? (groupSpent[group] / baseIncomeCents) * 100 : 0,
    };
  });

  const expenseCents = groupSpent.necessidades + groupSpent.desejos;
  const investedCents = groupSpent.poupanca;
  const debtCents = spentByCat.get('dividas') ?? 0;

  /*
   * Projeção do fechamento do mês. Extrapolar o gasto total por dia estoura a
   * conta, porque aluguel, parcelas e contas de consumo vencem uma vez só e
   * seriam contados de novo a cada dia restante. Então:
   *   - custo fixo: o que já venceu, ou o total do mês passado se ainda falta vencer;
   *   - gasto variável: esse sim segue o ritmo diário.
   */
  let projectedExpenseCents: number | null = null;
  const day = now.getDate();
  if (month === currentMonthKey(now) && day >= 5) {
    let fixedSoFar = 0;
    let variableSoFar = 0;
    for (const u of categories) {
      if (u.category.group === 'poupanca') continue;
      if (FIXED_COST_CATEGORIES.has(u.category.id)) fixedSoFar += u.spentCents;
      else variableSoFar += u.spentCents;
    }
    const prevMonth = shiftMonth(month, -1);
    const prevFixed = txs
      .filter((t) => t.type === 'expense' && monthKey(t.date) === prevMonth && FIXED_COST_CATEGORIES.has(t.categoryId))
      .reduce((a, t) => a + t.amountCents, 0);
    projectedExpenseCents = Math.round(Math.max(fixedSoFar, prevFixed) + (variableSoFar / day) * daysInMonth(month));
  }

  return {
    month,
    incomeCents,
    baseIncomeCents,
    expenseCents,
    investedCents,
    balanceCents: incomeCents - expenseCents - investedCents,
    savingsRatePct: baseIncomeCents > 0 ? ((baseIncomeCents - expenseCents) / baseIncomeCents) * 100 : 0,
    debtCents,
    debtRatioPct: baseIncomeCents > 0 ? (debtCents / baseIncomeCents) * 100 : 0,
    groups,
    categories,
    projectedExpenseCents,
  };
}

export interface SeriesPoint {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

/** Receitas x despesas dos últimos `n` meses terminando em `endMonth`. */
export function monthlySeries(txs: Transaction[], endMonth: string, n = 6): SeriesPoint[] {
  const months = Array.from({ length: n }, (_, i) => shiftMonth(endMonth, i - (n - 1)));
  const map = new Map<string, SeriesPoint>(months.map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0 }]));
  const poupanca = new Set(CATEGORIES.filter((c) => c.group === 'poupanca').map((c) => c.id));
  for (const t of txs) {
    const p = map.get(monthKey(t.date));
    if (!p || t.categoryId === 'transferencia') continue;
    if (t.type === 'income') p.incomeCents += t.amountCents;
    else if (!poupanca.has(t.categoryId)) p.expenseCents += t.amountCents; // aporte não é despesa
  }
  return months.map((m) => map.get(m)!);
}

/**
 * Gasto mensal médio em necessidades, base da reserva de emergência.
 *
 * Usa até 3 meses **completos**: o mês corrente fica de fora porque as contas
 * fixas ainda não venceram e puxariam a média para baixo, fazendo a meta da
 * reserva parecer menor do que é. Sem mês completo com dados, estima por 50%
 * da renda (a fatia de necessidades na regra 50/30/20).
 */
export function essentialMonthlyCost(
  txs: Transaction[],
  endMonth: string,
  settings: Settings,
  now: Date = new Date(),
): number {
  const necessidades = new Set(CATEGORIES.filter((c) => c.group === 'necessidades').map((c) => c.id));
  const lastComplete = endMonth === currentMonthKey(now) ? shiftMonth(endMonth, -1) : endMonth;
  const totals: number[] = [];
  for (let i = 0; i < 3; i++) {
    const m = shiftMonth(lastComplete, -i);
    const sum = txs
      .filter((t) => t.type === 'expense' && monthKey(t.date) === m && necessidades.has(t.categoryId))
      .reduce((a, t) => a + t.amountCents, 0);
    if (sum > 0) totals.push(sum);
  }
  if (totals.length) return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);

  const declared = settings.monthlyIncomeCents;
  const earned = txs
    .filter((t) => t.type === 'income' && monthKey(t.date) === endMonth && t.categoryId !== 'transferencia')
    .reduce((a, t) => a + t.amountCents, 0);
  return Math.round((declared > 0 ? declared : earned) * 0.5);
}

export interface EmergencyStatus {
  essentialCents: number;
  targetCents: number; // 6 meses
  balanceCents: number;
  monthsCovered: number;
  progress: number; // 0..1
  /** Aporte mensal sugerido para atingir a meta em 12 meses. */
  suggestedMonthlyCents: number;
}

export function emergencyStatus(
  txs: Transaction[],
  endMonth: string,
  settings: Settings,
  now: Date = new Date(),
): EmergencyStatus {
  const essentialCents = essentialMonthlyCost(txs, endMonth, settings, now);
  const targetCents = essentialCents * 6;
  const balanceCents = settings.emergencyBalanceCents;
  return {
    essentialCents,
    targetCents,
    balanceCents,
    monthsCovered: essentialCents > 0 ? balanceCents / essentialCents : 0,
    progress: targetCents > 0 ? Math.min(1, balanceCents / targetCents) : 0,
    suggestedMonthlyCents: Math.max(0, Math.ceil((targetCents - balanceCents) / 12)),
  };
}
