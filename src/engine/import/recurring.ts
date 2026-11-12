import { groupingKey } from '../categorizer';
import { monthKey } from '../dates';
import type { Transaction } from '../types';

/**
 * Categorias cujo gasto quase sempre é um compromisso mensal. Serve para
 * sugerir a marcação quando o extrato cobre um mês só e nada se repete nele.
 */
const LIKELY_RECURRING = new Set(['moradia', 'contas', 'assinaturas', 'dividas', 'educacao']);

export interface RecurringGroup {
  key: string;
  /** Nome como aparece no extrato. */
  label: string;
  categoryId: string;
  /** Posições das linhas deste grupo na lista da prévia. */
  indexes: number[];
  /** Quanto pesa por mês (total dividido pelos meses em que aparece). */
  monthlyCents: number;
  /** Em quantos meses diferentes o lançamento aparece no arquivo. */
  months: number;
  /** Já vem marcado: repete em 2+ meses com valor parecido, ou é de categoria tipicamente fixa. */
  suggested: boolean;
}

type Row = Pick<Transaction, 'date' | 'description' | 'amountCents' | 'type' | 'categoryId'>;

/**
 * Agrupa as despesas do extrato por descrição para o usuário dizer quais são
 * gastos constantes. Pré-marca o que repete mês a mês com valor estável.
 */
export function groupRecurringCandidates(rows: Row[]): RecurringGroup[] {
  const groups = new Map<string, {
    label: string;
    lastDate: string;
    categoryId: string;
    indexes: number[];
    byMonth: Map<string, number>;
  }>();


  rows.forEach((r, index) => {
    if (r.type !== 'expense' || r.categoryId === 'transferencia') return;
    const key = groupingKey(r.description) || 'sem-descricao';
    const g = groups.get(key) ?? {
      label: r.description,
      lastDate: r.date,
      categoryId: r.categoryId,
      indexes: [] as number[],
      byMonth: new Map<string, number>(),
    };
    if (r.date >= g.lastDate) {
      g.label = r.description;
      g.lastDate = r.date;
      g.categoryId = r.categoryId;
    }
    g.indexes.push(index);
    const m = monthKey(r.date);
    g.byMonth.set(m, (g.byMonth.get(m) ?? 0) + r.amountCents);
    groups.set(key, g);
  });

  const out: RecurringGroup[] = [];
  for (const [key, g] of groups) {
    const values = [...g.byMonth.values()];
    const months = values.length;
    const total = values.reduce((a, b) => a + b, 0);
    // Exigimos valor quase idêntico: um iFood de R$ 54 e outro de R$ 61 repete,
    // mas não é compromisso fixo — já um aluguel ou assinatura não varia.
    const stable = months >= 2 && Math.min(...values) / Math.max(...values) >= 0.98;
    out.push({
      key,
      label: g.label.trim() || 'Sem descrição',
      categoryId: g.categoryId,
      indexes: g.indexes,
      monthlyCents: Math.round(total / months),
      months,
      suggested: stable || (months === 1 && LIKELY_RECURRING.has(g.categoryId)),
    });
  }

  // Sugeridos primeiro, depois os mais caros: o que decide o orçamento aparece no topo.
  return out.sort((a, b) => Number(b.suggested) - Number(a.suggested) || b.monthlyCents - a.monthlyCents);
}
