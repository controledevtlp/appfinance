import { computeMonthSummary, emergencyStatus } from './budget';
import { currentMonthKey, daysInMonth, monthKey, shiftMonth } from './dates';
import { formatBRL } from './money';
import type { MonthSummary, Settings, Tip, TipSeverity, Transaction } from './types';

/** Ações práticas por categoria, usadas nos planos de redução. */
const ADVICE: Record<string, string[]> = {
  moradia: [
    'Renegocie o aluguel ou o condomínio (peça desconto para pagamento em dia ou contrato mais longo).',
    'Avalie dividir a moradia ou mudar para uma região mais barata quando o contrato vencer.',
  ],
  contas: [
    'Compare planos de internet e celular: muitas operadoras cobrem a oferta do concorrente.',
    'Reduza o consumo de energia: banhos mais curtos, lâmpadas LED e standby desligado.',
  ],
  mercado: [
    'Faça lista antes de ir e compre uma vez por semana (menos idas = menos compras por impulso).',
    'Compare o preço por kg/litro e dê preferência a marcas próprias e hortifruti da estação.',
    'Evite ir ao mercado com fome e deixe de comprar produtos prontos.',
  ],
  transporte: [
    'Compare combustível pelo app do posto e abasteça no mais barato do seu trajeto.',
    'Troque 2 corridas de aplicativo por semana por transporte público ou carona.',
    'Revise seguro e IPVA: cotar de novo todo ano costuma baixar o valor.',
  ],
  saude: [
    'Compare o plano de saúde atual com opções por coparticipação ou o benefício da empresa.',
    'Use genéricos e programas de desconto das farmácias.',
  ],
  educacao: ['Procure bolsas, cursos gratuitos e planos anuais, que costumam sair mais baratos.'],
  dividas: [
    'Priorize quitar primeiro a dívida com maior juros (rotativo do cartão e cheque especial).',
    'Peça renegociação ou portabilidade do crédito para uma taxa menor.',
    'Nunca pague só o mínimo da fatura: o rotativo é uma das taxas mais caras do mercado.',
  ],
  delivery: [
    'Defina um teto semanal (ex.: 2 pedidos) e registre cada um no app.',
    'Cozinhe em lote no domingo e leve marmita nos dias úteis.',
    'Reserve o delivery para o fim de semana e use cupons só quando já fosse pedir.',
  ],
  lazer: [
    'Defina um valor fixo de lazer por semana e use dinheiro/cartão pré-pago para respeitá-lo.',
    'Troque parte dos programas pagos por opções gratuitas (parques, eventos públicos, encontros em casa).',
  ],
  compras: [
    'Adote a regra das 48 horas: espere 2 dias antes de qualquer compra não essencial.',
    'Coloque o desejo em uma lista e compre só se ainda fizer sentido no fim do mês.',
    'Desinstale apps de loja e cancele as notificações de promoção.',
  ],
  assinaturas: [
    'Liste todas as assinaturas e cancele as que você não usou nos últimos 30 dias.',
    'Divida planos familiares ou alterne entre streamings (um por mês).',
  ],
  cuidados: ['Espace as visitas ao salão e compare preços; produtos em refil costumam ser mais baratos.'],
  outros: ['Detalhe esses gastos em categorias específicas: o que não tem nome costuma escapar do controle.'],
};

/** Excessos menores que R$ 20 não geram plano de redução. */
const MIN_GAP_CENTS = 2000;

const FEES_RE = /juros|iof|encargo|multa|\bmora\b|tarifa|anuidade|cesta de servi|taxa de manuten/i;

const SEVERITY_ORDER: Record<TipSeverity, number> = { alerta: 0, atencao: 1, info: 2, positivo: 3 };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Subscription {
  name: string;
  monthlyCents: number;
}

/** Assinaturas = gastos da categoria "assinaturas" que se repetem em 2+ meses com valor parecido. */
export function detectSubscriptions(txs: Transaction[], endMonth: string): Subscription[] {
  const months = [endMonth, shiftMonth(endMonth, -1), shiftMonth(endMonth, -2)];
  const byName = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (t.type !== 'expense' || t.categoryId !== 'assinaturas') continue;
    const m = monthKey(t.date);
    if (!months.includes(m)) continue;
    const key = norm(t.description) || 'assinatura';
    const inner = byName.get(key) ?? new Map<string, number>();
    inner.set(m, (inner.get(m) ?? 0) + t.amountCents);
    byName.set(key, inner);
  }
  const out: Subscription[] = [];
  for (const [name, perMonth] of byName) {
    if (perMonth.size < 2) continue;
    const values = [...perMonth.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (min / max < 0.85) continue;
    out.push({ name, monthlyCents: Math.round(values.reduce((a, b) => a + b, 0) / values.length) });
  }
  return out.sort((a, b) => b.monthlyCents - a.monthlyCents);
}

export function generateTips(
  txs: Transaction[],
  month: string,
  settings: Settings,
  now: Date = new Date(),
): Tip[] {
  const summary: MonthSummary = computeMonthSummary(txs, month, settings, now);
  const prev = computeMonthSummary(txs, shiftMonth(month, -1), settings, now);
  const tips: Tip[] = [];
  const base = summary.baseIncomeCents;

  if (base <= 0) {
    tips.push({
      id: 'sem-renda',
      severity: 'info',
      title: 'Informe sua renda para calcular o ideal',
      message: 'Sem a renda líquida mensal não dá para calcular quanto gastar em cada categoria.',
      savingsCents: 0,
      steps: ['Abra Ajustes e preencha “Renda líquida mensal”, ou lance suas receitas do mês.'],
    });
    return tips;
  }

  const flaggedOver = new Set<string>();

  // 1) Categorias acima do limite ideal -> plano de redução em 3 etapas.
  for (const u of summary.categories) {
    if (u.status !== 'over' || u.category.group === 'poupanca' || u.spentCents <= 0) continue;
    const gap = u.spentCents - u.limitCents;
    if (gap < MIN_GAP_CENTS) continue; // estouro irrelevante não vira dica
    flaggedOver.add(u.category.id);
    const third = Math.round(gap / 3);
    const pct = u.limitCents > 0 ? Math.round((u.spentCents / u.limitCents - 1) * 100) : 100;
    tips.push({
      id: `over:${u.category.id}`,
      severity: u.ratio > 1.3 ? 'alerta' : 'atencao',
      categoryId: u.category.id,
      title: `${u.category.name}: ${pct}% acima do ideal`,
      message: `Você gastou ${formatBRL(u.spentCents)} e o ideal para a sua renda é ${formatBRL(u.limitCents)}. Chegar ao ideal libera ${formatBRL(gap)} por mês.`,
      savingsCents: gap,
      steps: [
        `Mês 1: corte ${formatBRL(third)} (um terço do excesso).`,
        `Mês 2: corte mais ${formatBRL(third)}, somando ${formatBRL(third * 2)}.`,
        `Mês 3: chegue ao ideal de ${formatBRL(u.limitCents)} (economia total de ${formatBRL(gap)}/mês).`,
        ...(ADVICE[u.category.id] ?? []),
      ],
    });
  }

  // 2) Crescimento forte em relação ao mês anterior (ajustado ao ritmo, se o mês não acabou).
  const factor = month === currentMonthKey(now) ? now.getDate() / daysInMonth(month) : 1;
  if (factor >= 0.33) {
    for (const u of summary.categories) {
      if (u.category.group === 'poupanca' || flaggedOver.has(u.category.id)) continue;
      const before = prev.categories.find((c) => c.category.id === u.category.id)?.spentCents ?? 0;
      const expected = before * factor;
      const diff = u.spentCents - expected;
      if (before > 0 && diff >= 5000 && u.spentCents >= expected * 1.25) {
        tips.push({
          id: `growth:${u.category.id}`,
          severity: 'atencao',
          categoryId: u.category.id,
          title: `${u.category.name} subiu em relação ao mês passado`,
          message: `Gasto de ${formatBRL(u.spentCents)} contra ${formatBRL(Math.round(expected))} esperados pelo mês anterior (+${formatBRL(Math.round(diff))}).`,
          savingsCents: Math.round(diff),
          steps: [
            'Abra os lançamentos da categoria e veja o que mudou (compra única ou hábito novo).',
            ...(ADVICE[u.category.id]?.slice(0, 2) ?? []),
          ],
        });
      }
    }
  }

  // 3) Assinaturas recorrentes.
  const subs = detectSubscriptions(txs, month);
  if (subs.length >= 2) {
    const total = subs.reduce((a, s) => a + s.monthlyCents, 0);
    const cheapestToCut = Math.round(total / subs.length);
    tips.push({
      id: 'assinaturas',
      severity: 'info',
      categoryId: 'assinaturas',
      title: `${subs.length} assinaturas somam ${formatBRL(total)}/mês`,
      message: `Cancelar só uma delas já economiza cerca de ${formatBRL(cheapestToCut)} por mês (${formatBRL(cheapestToCut * 12)} por ano).`,
      savingsCents: cheapestToCut,
      steps: [
        ...subs.slice(0, 5).map((s) => `${s.name}: ${formatBRL(s.monthlyCents)}/mês`),
        ...ADVICE.assinaturas,
      ],
    });
  }

  // 4) Juros e tarifas.
  const fees = txs
    .filter((t) => t.type === 'expense' && monthKey(t.date) === month && FEES_RE.test(t.description))
    .reduce((a, t) => a + t.amountCents, 0);
  if (fees > 0) {
    tips.push({
      id: 'tarifas',
      severity: 'alerta',
      title: `Você pagou ${formatBRL(fees)} em juros e tarifas`,
      message: 'Esse dinheiro não compra nada: dá para eliminar quase tudo com algumas ligações.',
      savingsCents: fees,
      steps: [
        'Pague a fatura do cartão sempre pelo valor total para fugir do rotativo.',
        'Peça isenção ou desconto na anuidade do cartão (ou troque por um sem anuidade).',
        'Migre para uma conta digital sem tarifa de manutenção.',
        'Programe os pagamentos no débito automático para evitar multa por atraso.',
      ],
    });
  }

  // 5) Taxa de poupança.
  const target = Math.round(base * 0.2);
  const saved = base - summary.expenseCents;
  // Mês em andamento: a sobra parece alta porque as contas ainda não venceram, então só alertamos o negativo.
  const monthClosed = month !== currentMonthKey(now);
  if (summary.expenseCents > 0 || summary.investedCents > 0) {
    if (summary.savingsRatePct < 0) {
      tips.push({
        id: 'poupanca',
        severity: 'alerta',
        title: 'Você está gastando mais do que ganha',
        message: `Os gastos passaram a renda em ${formatBRL(-saved)}. Isso vira dívida se continuar.`,
        savingsCents: Math.max(0, target - saved),
        steps: [
          'Corte primeiro os desejos (delivery, compras, lazer) até o saldo voltar a ficar positivo.',
          'Evite parcelar novas compras neste período.',
          'Veja as dicas por categoria abaixo: elas mostram onde está o maior excesso.',
        ],
      });
    } else if (!monthClosed) {
      // sem dica de taxa de poupança até o mês fechar
    } else if (summary.savingsRatePct < 10) {
      tips.push({
        id: 'poupanca',
        severity: 'atencao',
        title: `Taxa de poupança baixa: ${summary.savingsRatePct.toFixed(0)}%`,
        message: `A meta é guardar 20% da renda (${formatBRL(target)}). Hoje sobram ${formatBRL(saved)}.`,
        savingsCents: Math.max(0, target - saved),
        steps: [
          'Programe uma transferência automática para investimentos logo no dia do salário.',
          'Comece pequeno: 5% agora e suba 1 ponto percentual por mês.',
        ],
      });
    } else if (summary.savingsRatePct < 20) {
      tips.push({
        id: 'poupanca',
        severity: 'info',
        title: `Quase lá: poupança de ${summary.savingsRatePct.toFixed(0)}%`,
        message: `Faltam ${formatBRL(Math.max(0, target - saved))} por mês para chegar à meta de 20%.`,
        savingsCents: Math.max(0, target - saved),
        steps: ['Automatize o aporte e some qualquer economia dos planos de redução abaixo.'],
      });
    } else {
      tips.push({
        id: 'poupanca',
        severity: 'positivo',
        title: `Ótimo: você poupa ${summary.savingsRatePct.toFixed(0)}% da renda`,
        message: 'Está dentro ou acima da meta de 20%. Mantenha o ritmo e invista o que sobra.',
        savingsCents: 0,
        steps: ['Direcione o excedente para a reserva de emergência e depois para objetivos de longo prazo.'],
      });
    }
  }

  // 6) Dívidas.
  if (summary.debtRatioPct > 30) {
    tips.push({
      id: 'dividas',
      severity: 'alerta',
      categoryId: 'dividas',
      title: `Dívidas comprometem ${summary.debtRatioPct.toFixed(0)}% da renda`,
      message: 'Acima de 30% o orçamento fica sem folga para imprevistos.',
      savingsCents: 0,
      steps: ADVICE.dividas,
    });
  }

  // 7) Reserva de emergência.
  const reserve = emergencyStatus(txs, month, settings);
  if (reserve.essentialCents > 0) {
    if (reserve.monthsCovered < 3) {
      tips.push({
        id: 'reserva',
        severity: reserve.monthsCovered < 1 ? 'alerta' : 'atencao',
        title: `Reserva cobre só ${reserve.monthsCovered.toFixed(1).replace('.', ',')} mês(es)`,
        message: `A meta é 6 meses de custos essenciais (${formatBRL(reserve.targetCents)}). Guardando ${formatBRL(reserve.suggestedMonthlyCents)} por mês você chega lá em 12 meses.`,
        savingsCents: 0,
        steps: [
          `Aporte mensal sugerido: ${formatBRL(reserve.suggestedMonthlyCents)}.`,
          'Deixe a reserva em investimento com liquidez diária (Tesouro Selic ou CDB de liquidez diária).',
        ],
      });
    } else if (reserve.monthsCovered >= 6) {
      tips.push({
        id: 'reserva',
        severity: 'positivo',
        title: 'Reserva de emergência completa',
        message: 'Você já cobre 6 meses ou mais de custos essenciais.',
        savingsCents: 0,
        steps: ['Novos aportes podem ir para metas de longo prazo.'],
      });
    }
  }

  // 8) Projeção do mês.
  if (summary.projectedExpenseCents !== null && summary.projectedExpenseCents > base * 0.8) {
    tips.push({
      id: 'projecao',
      severity: 'atencao',
      title: 'No ritmo atual, o mês fecha estourado',
      message: `Projeção de ${formatBRL(summary.projectedExpenseCents)} em gastos (${Math.round((summary.projectedExpenseCents / base) * 100)}% da renda); o ideal é até 80%.`,
      savingsCents: Math.max(0, summary.projectedExpenseCents - Math.round(base * 0.8)),
      steps: ['Segure gastos de desejos até o fim do mês e confira as categorias em amarelo e vermelho.'],
    });
  }

  return tips.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.savingsCents - a.savingsCents,
  );
}

/** Soma da economia mensal possível se todos os planos forem seguidos (sem contar a meta de poupança). */
export function totalPotentialSavings(tips: Tip[]): number {
  return tips.filter((t) => t.id !== 'poupanca' && t.id !== 'projecao').reduce((a, t) => a + t.savingsCents, 0);
}

