/*
 * Simulador de renda fixa.
 *
 * Tudo aqui é matemática pura e conferível: juros compostos com aporte
 * mensal, imposto de renda pela tabela regressiva e a regra da poupança.
 * Nada de taxa chutada — a taxa de referência (CDI/Selic) é informada pela
 * pessoa, porque ela muda e um número fixo no código envelheceria mentindo.
 */

export interface SimPoint {
  month: number;
  /** Quanto você colocou do próprio bolso até aqui. */
  investedCents: number;
  /** Quanto tem na conta, já com juros. */
  balanceCents: number;
}

export interface SimResult {
  points: SimPoint[];
  investedCents: number;
  /** Valor final antes do imposto. */
  grossCents: number;
  /** Só o que os juros renderam, antes do imposto. */
  interestCents: number;
  taxCents: number;
  /** O que sobra no seu bolso, depois do imposto. */
  netCents: number;
  /** Alíquota de IR aplicada (0 para isento). */
  taxRate: number;
}

/** Taxa mensal equivalente a uma taxa anual (juros compostos). */
export function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/**
 * Tabela regressiva do IR para renda fixa, sobre o rendimento.
 * Quanto mais tempo o dinheiro fica, menos imposto.
 *
 * O prazo real conta em dias de calendário entre aplicar e resgatar; aqui
 * cada mês vale 30 dias, que é uma aproximação. Perto das viradas de faixa
 * (6, 12 e 24 meses) a alíquota real pode cair um degrau antes.
 */
export function irRate(months: number): number {
  const days = months * 30;
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

/**
 * Quanto a poupança rende ao ano.
 * Com a Selic acima de 8,5% ela trava em 0,5% ao mês; abaixo disso, rende
 * 70% da Selic. Nos dois casos ainda tem a TR, que fica fora da conta por
 * ser próxima de zero há anos — então o número aqui é otimista, não o contrário.
 */
export function poupancaAnnualPct(selicPct: number): number {
  if (selicPct > 8.5) return (Math.pow(1.005, 12) - 1) * 100;
  return selicPct * 0.7;
}

export interface SimInput {
  initialCents: number;
  monthlyCents: number;
  months: number;
  /** Taxa anual do produto, já em % ao ano. */
  annualPct: number;
  /** LCI, LCA e poupança não pagam imposto de renda. */
  taxExempt?: boolean;
}

export function simulate({ initialCents, monthlyCents, months, annualPct, taxExempt }: SimInput): SimResult {
  const r = monthlyRate(annualPct);
  const points: SimPoint[] = [];
  let balance = initialCents;
  let invested = initialCents;
  points.push({ month: 0, investedCents: invested, balanceCents: Math.round(balance) });

  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + r) + monthlyCents;
    invested += monthlyCents;
    points.push({ month: m, investedCents: invested, balanceCents: Math.round(balance) });
  }

  const grossCents = Math.round(balance);
  const interestCents = Math.max(0, grossCents - invested);
  const taxRate = taxExempt ? 0 : irRate(months);
  const taxCents = Math.round(interestCents * taxRate);

  return {
    points,
    investedCents: invested,
    grossCents,
    interestCents,
    taxCents,
    netCents: grossCents - taxCents,
    taxRate,
  };
}

/**
 * Quanto guardar por mês para ter o valor **no bolso** no fim do prazo.
 *
 * O alvo é líquido, depois do imposto: se a conta mirasse o bruto, a pessoa
 * pediria R$ 30 mil, o app diria um aporte, e no fim chegariam só R$ 29 mil
 * — porque o IR comeria o resto. Partindo de
 *   líquido = inicial*(f*(1-ir) + ir) + aporte*(s*(1-ir) + ir*meses)
 * basta isolar o aporte.
 */
export function monthlyNeeded(
  targetCents: number,
  initialCents: number,
  months: number,
  annualPct: number,
  taxExempt = false,
): number {
  if (months <= 0) return 0;
  const r = monthlyRate(annualPct);
  const ir = taxExempt ? 0 : irRate(months);
  const f = Math.pow(1 + r, months);
  const s = r === 0 ? months : (f - 1) / r;

  const fromInitial = initialCents * (f * (1 - ir) + ir);
  const missing = targetCents - fromInitial;
  if (missing <= 0) return 0;

  const perReal = s * (1 - ir) + ir * months;
  if (perReal <= 0) return 0;
  return Math.ceil(missing / perReal);
}

export interface Product {
  id: string;
  name: string;
  /** Como a taxa é descrita para a pessoa. */
  detail: string;
  annualPct: number;
  taxExempt: boolean;
}

/**
 * Os produtos mais comuns de renda fixa, com a taxa derivada do CDI que a
 * pessoa informou. O objetivo é comparar pelo **líquido**: um CDB de 110%
 * do CDI com imposto pode render menos que uma LCI isenta de 95%.
 */
export function defaultProducts(cdiPct: number, cdbPct = 100, lciPct = 90): Product[] {
  return [
    { id: 'selic', name: 'Tesouro Selic', detail: 'acompanha a Selic, saque no mesmo dia', annualPct: cdiPct, taxExempt: false },
    { id: 'cdb', name: `CDB ${cdbPct}% do CDI`, detail: 'garantia do FGC até R$ 250 mil por banco', annualPct: (cdiPct * cdbPct) / 100, taxExempt: false },
    { id: 'lci', name: `LCI/LCA ${lciPct}% do CDI`, detail: 'isenta de imposto de renda, costuma ter carência', annualPct: (cdiPct * lciPct) / 100, taxExempt: true },
    { id: 'poupanca', name: 'Poupança', detail: 'isenta de imposto, mas rende menos', annualPct: poupancaAnnualPct(cdiPct), taxExempt: true },
  ];
}

export interface Comparison extends Product {
  result: SimResult;
  /** Diferença para o melhor da lista, em centavos (0 para o melhor). */
  behindBestCents: number;
}

/** Compara os produtos pelo valor líquido no fim do prazo, do melhor para o pior. */
export function compareProducts(products: Product[], base: Omit<SimInput, 'annualPct' | 'taxExempt'>): Comparison[] {
  const rows = products.map((p) => ({
    ...p,
    result: simulate({ ...base, annualPct: p.annualPct, taxExempt: p.taxExempt }),
    behindBestCents: 0,
  }));
  rows.sort((a, b) => b.result.netCents - a.result.netCents);
  const best = rows[0]?.result.netCents ?? 0;
  for (const row of rows) row.behindBestCents = best - row.result.netCents;
  return rows;
}
