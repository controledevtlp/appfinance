import { irRate, simulate, type SimPoint } from './invest';

/*
 * O "pra onde eu vou com essa grana".
 *
 * A pessoa responde quatro perguntas — pra que é o dinheiro, quando vai
 * precisar, se pode precisar antes e quanto aguenta ver o valor balançar — e
 * daqui sai um caminho: em que TIPO de aplicação cada parte do dinheiro
 * costuma ir para aquele objetivo, com o porquê e o cuidado de cada uma.
 *
 * Três limites, de propósito:
 *  - Só tipos de produto (Tesouro Selic, CDB, LCI/LCA, Tesouro IPCA+), nunca
 *    banco, corretora ou título específico.
 *  - As regras são as de manual: reserva em liquidez diária, prazo curto em
 *    pós-fixado, prazo longo com proteção contra a inflação. Não é análise
 *    de perfil feita por profissional, e a tela diz isso.
 *  - Na conta, nada rende mais do que dá pra garantir: a parte em IPCA+ e a
 *    parte em renda variável entram rendendo o CDI, sem promessa de ganho
 *    extra. O resultado mostrado é um piso honesto, não uma vitrine.
 */

export type Goal = 'reserva' | 'compra' | 'aposentadoria' | 'render';
export type Access = 'qualquer-hora' | 'pode-travar';
export type Nerve = 'nenhum' | 'pouco' | 'aguento';

export interface Path {
  goal: Goal;
  months: number;
  access: Access;
  nerve: Nerve;
}

export type SliceId = 'liquidez' | 'isento' | 'cdb-prazo' | 'ipca' | 'variavel';

export interface PlanSlice {
  id: SliceId;
  name: string;
  /** Parte do dinheiro que vai aqui, em %. As fatias somam 100. */
  sharePct: number;
  /** Taxa usada na conta, em % ao ano. */
  annualPct: number;
  taxExempt: boolean;
  /** Por que essa fatia faz sentido para as respostas dadas. */
  why: string;
  /** O que pode dar errado. */
  caution: string;
  /** Como a taxa da conta foi escolhida, para a tela poder explicar. */
  rateNote: string;
}

export interface Plan {
  title: string;
  summary: string;
  slices: PlanSlice[];
  /** Puxões de orelha: coisas pra resolver antes ou pra ficar esperto. */
  warnings: string[];
}

export interface PlanContext {
  /** Quantos meses de custo essencial a reserva atual cobre. */
  reserveMonths?: number;
}

/** "10,5", "11,55", "9": até duas casas, sem zero sobrando. */
const pct = (v: number) => String(Number(v.toFixed(2))).replace('.', ',');

function liquidez(cdi: number, share: number, why: string): PlanSlice {
  return {
    id: 'liquidez',
    name: 'Tesouro Selic ou CDB de liquidez diária',
    sharePct: share,
    annualPct: cdi,
    taxExempt: false,
    why,
    caution: 'CDB só vale a pena pagando perto de 100% do CDI ou mais, e fica dentro do FGC até R$ 250 mil por banco. No Tesouro Selic tem a taxa da B3 de 0,2% ao ano acima de R$ 10 mil.',
    rateNote: `100% do CDI (${pct(cdi)}% ao ano), com imposto de renda`,
  };
}

/**
 * Pós-fixado com vencimento: LCI/LCA isenta a 90% do CDI contra CDB a 110%
 * com imposto. Ganha quem deixa mais no bolso naquele prazo — e isso muda
 * com o prazo, porque o imposto do CDB cai com o tempo.
 */
function posFixado(cdi: number, months: number, share: number, why: string): PlanSlice {
  const lci = (cdi * 90) / 100;
  const cdb = (cdi * 110) / 100;
  const probe = { initialCents: 1_000_000, monthlyCents: 0, months };
  const lciWins = simulate({ ...probe, annualPct: lci, taxExempt: true }).netCents >= simulate({ ...probe, annualPct: cdb }).netCents;
  if (lciWins) {
    return {
      id: 'isento',
      name: 'LCI ou LCA',
      sharePct: share,
      annualPct: lci,
      taxExempt: true,
      why: `${why} Nesse prazo, uma LCI/LCA de 90% do CDI sem imposto deixa mais no bolso que um CDB de 110% com imposto.`,
      caution: 'Tem carência: o dinheiro fica preso até o vencimento. Só coloca aqui o que você tem certeza que não vai precisar antes. Coberta pelo FGC até R$ 250 mil por banco.',
      rateNote: `90% do CDI (${pct(lci)}% ao ano), isenta de imposto de renda`,
    };
  }
  return {
    id: 'cdb-prazo',
    name: 'CDB com vencimento',
    sharePct: share,
    annualPct: cdb,
    taxExempt: false,
    why: `${why} Nesse prazo o imposto já caiu pra ${pct(irRate(months) * 100)}%, e um CDB de 110% do CDI passa uma LCI/LCA de 90% mesmo pagando imposto.`,
    caution: 'CDB que paga mais costuma ser de banco menor e sem resgate antes do vencimento. Fica dentro do limite do FGC (R$ 250 mil por banco) e não coloca o que pode precisar antes.',
    rateNote: `110% do CDI (${pct(cdb)}% ao ano), com imposto de renda`,
  };
}

function ipca(cdi: number, share: number, why: string): PlanSlice {
  return {
    id: 'ipca',
    name: 'Tesouro IPCA+',
    sharePct: share,
    annualPct: cdi,
    taxExempt: false,
    why,
    caution: 'Se vender antes do vencimento, o preço do dia pode ser menor do que você pagou. Só entra aqui o dinheiro que vai ficar até o fim.',
    rateNote: `rende igual ao CDI (${pct(cdi)}% ao ano), porque o ganho real depende da inflação, que ninguém sabe`,
  };
}

function variavel(cdi: number, share: number): PlanSlice {
  return {
    id: 'variavel',
    name: 'Renda variável (ETF de índice, ações, fundos imobiliários)',
    sharePct: share,
    annualPct: cdi,
    taxExempt: false,
    why: 'Em prazo longo, e pra quem aguenta ver o saldo cair no meio do caminho, é a parte que pode render acima da renda fixa.',
    caution: 'Pode fechar anos no vermelho, e não tem garantia nenhuma. Se a queda vai te fazer vender no susto, deixa essa fatia na renda fixa.',
    rateNote: `rende só o CDI (${pct(cdi)}% ao ano), porque não dá pra prever e eu não vou inflar o resultado`,
  };
}

/** Monta o caminho a partir das respostas. As fatias sempre somam 100%. */
export function buildPlan(path: Path, cdiPct: number, ctx: PlanContext = {}): Plan {
  const { goal, months, nerve } = path;
  // Reserva de emergência é liquidez diária por definição, responda o que responder.
  const access: Access = goal === 'reserva' ? 'qualquer-hora' : path.access;
  const warnings: string[] = [];

  if (goal !== 'reserva' && ctx.reserveMonths !== undefined && ctx.reserveMonths < 3) {
    warnings.push(
      `Antes disso, a reserva: você tem ${ctx.reserveMonths.toFixed(1).replace('.', ',')} mês de custo guardado. Travar dinheiro sem reserva é pedir pra se foder no primeiro imprevisto, porque aí você resgata no pior momento ou vai pro cheque especial.`,
    );
  }
  if (goal === 'aposentadoria' && months < 60) {
    warnings.push('Aposentadoria em menos de 5 anos? Com um prazo curto assim eu trato como objetivo de curto prazo, sem a parte que balança.');
  }

  if (access === 'qualquer-hora') {
    if (goal !== 'reserva' && months > 24) {
      warnings.push('Você disse que pode precisar a qualquer hora, então fica tudo em liquidez diária. Se der pra travar uma parte, rende mais: troca a resposta e compara.');
    }
    return {
      title: goal === 'reserva' ? 'Reserva é liquidez diária, e ponto' : 'Tudo onde dá pra sacar no mesmo dia',
      summary:
        goal === 'reserva'
          ? 'Reserva não existe pra render muito. Existe pra estar lá, inteira, no dia que der merda. Então a regra é simples: rende todo dia e sai na hora.'
          : 'Como você pode precisar a qualquer momento, nada de carência nem de título que oscila. Rende um pouco menos, mas tá sempre na mão.',
      slices: [
        liquidez(
          cdiPct,
          100,
          goal === 'reserva'
            ? 'Rende perto de 100% do CDI e você saca no mesmo dia, sem perder nada por sair antes.'
            : 'É o único tipo que rende bem e deixa você sacar quando quiser, sem multa nem perda.',
        ),
      ],
      warnings,
    };
  }

  const goalWhy =
    goal === 'compra'
      ? 'Você tem data pra usar esse dinheiro, então ele precisa estar lá, sem susto, no dia.'
      : goal === 'aposentadoria'
        ? 'É dinheiro de longo prazo, mas essa parte é a que segura o plano sem balançar.'
        : 'É a parte que rende acima da liquidez diária sem oscilar no caminho.';

  // Até 2 anos: não dá tempo de se recuperar de uma queda, então nada que oscila.
  if (months <= 24) {
    return {
      title: 'Prazo curto: pós-fixado até o vencimento',
      summary: 'Com menos de 2 anos pela frente, o que importa é não ter surpresa. Um título pós-fixado que vence perto da data em que você vai usar resolve.',
      slices: [posFixado(cdiPct, months, 100, goalWhy)],
      warnings,
    };
  }

  const ipcaWhy = 'Garante ganho acima da inflação até o vencimento. Em prazo longo é o que protege o poder de compra do dinheiro.';
  const long = months > 60;

  let slices: PlanSlice[];
  if (!long) {
    slices =
      nerve === 'nenhum'
        ? [posFixado(cdiPct, months, 100, goalWhy)]
        : nerve === 'pouco'
          ? [posFixado(cdiPct, months, 70, goalWhy), ipca(cdiPct, 30, ipcaWhy)]
          : [posFixado(cdiPct, months, 50, goalWhy), ipca(cdiPct, 50, ipcaWhy)];
  } else {
    slices =
      nerve === 'nenhum'
        ? [posFixado(cdiPct, months, 60, goalWhy), ipca(cdiPct, 40, ipcaWhy)]
        : nerve === 'pouco' || goal === 'compra'
          ? [ipca(cdiPct, 60, ipcaWhy), posFixado(cdiPct, months, 40, goalWhy)]
          : [ipca(cdiPct, 50, ipcaWhy), posFixado(cdiPct, months, 30, goalWhy), variavel(cdiPct, 20)];
  }
  if (long && nerve === 'aguento' && goal === 'compra') {
    warnings.push('Como esse dinheiro tem data pra ser usado, deixei a renda variável de fora: se ela estiver em baixa no dia da compra, você se ferra.');
  }

  return {
    title: long ? 'Prazo longo: proteger da inflação' : 'Prazo médio: a maior parte sem balançar',
    summary: long
      ? 'Em mais de 5 anos, o inimigo é a inflação comendo o dinheiro calado. Por isso uma parte boa vai pra título que paga acima dela.'
      : 'Entre 2 e 5 anos dá pra buscar um pouco mais, mas a base continua em pós-fixado, que não dá susto.',
    slices,
    warnings,
  };
}

export interface PlanAmounts {
  initialCents: number;
  monthlyCents: number;
  months: number;
}

export interface PlanResult {
  points: SimPoint[];
  investedCents: number;
  interestCents: number;
  taxCents: number;
  netCents: number;
  /** Resultado de cada fatia, na mesma ordem do plano. */
  perSlice: { slice: PlanSlice; initialCents: number; monthlyCents: number; netCents: number; taxRate: number }[];
}

/** Divide um valor pelas fatias sem perder centavo: a sobra do arredondamento vai pra primeira. */
function split(totalCents: number, slices: PlanSlice[]): number[] {
  const parts = slices.map((s) => Math.floor((totalCents * s.sharePct) / 100));
  parts[0] += totalCents - parts.reduce((a, b) => a + b, 0);
  return parts;
}

/** Simula o plano inteiro: cada fatia com a sua taxa e o seu imposto, somadas mês a mês. */
export function simulatePlan(plan: Plan, { initialCents, monthlyCents, months }: PlanAmounts): PlanResult {
  const initials = split(initialCents, plan.slices);
  const monthlies = split(monthlyCents, plan.slices);
  const runs = plan.slices.map((slice, i) => ({
    slice,
    initialCents: initials[i],
    monthlyCents: monthlies[i],
    result: simulate({ initialCents: initials[i], monthlyCents: monthlies[i], months, annualPct: slice.annualPct, taxExempt: slice.taxExempt }),
  }));
  const points: SimPoint[] = Array.from({ length: months + 1 }, (_, m) => ({
    month: m,
    investedCents: runs.reduce((a, r) => a + r.result.points[m].investedCents, 0),
    balanceCents: runs.reduce((a, r) => a + r.result.points[m].balanceCents, 0),
  }));
  const sum = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0);
  return {
    points,
    investedCents: sum((r) => r.result.investedCents),
    interestCents: sum((r) => r.result.interestCents),
    taxCents: sum((r) => r.result.taxCents),
    netCents: sum((r) => r.result.netCents),
    perSlice: runs.map((r) => ({ slice: r.slice, initialCents: r.initialCents, monthlyCents: r.monthlyCents, netCents: r.result.netCents, taxRate: r.result.taxRate })),
  };
}

/**
 * Quanto guardar por mês, seguindo o plano, para ter o valor no bolso no fim.
 * O plano mistura taxas e impostos diferentes, então não há fórmula fechada:
 * a resposta sai por busca binária sobre a própria simulação.
 */
export function monthlyForPlan(plan: Plan, targetCents: number, initialCents: number, months: number): number {
  if (months <= 0 || targetCents <= 0) return 0;
  const netWith = (monthlyCents: number) => simulatePlan(plan, { initialCents, monthlyCents, months }).netCents;
  if (netWith(0) >= targetCents) return 0;
  let lo = 0;
  let hi = Math.max(100, Math.ceil(targetCents / months));
  while (netWith(hi) < targetCents) hi *= 2;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (netWith(mid) >= targetCents) hi = mid;
    else lo = mid;
  }
  return hi;
}
