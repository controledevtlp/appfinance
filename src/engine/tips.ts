import { computeMonthSummary, emergencyStatus } from './budget';
import { FIXED_COST_CATEGORIES } from './categories';
import { currentMonthKey, monthKey, shiftMonth } from './dates';
import { groupingKey } from './categorizer';
import { formatBRL } from './money';
import type { MonthSummary, Settings, Tip, TipSeverity, Transaction } from './types';

/** Conselho prático por categoria, no tom de um amigo falando com você. */
const ADVICE: Record<string, string[]> = {
  moradia: [
    'Liga pro dono ou pra imobiliária e pede desconto. Quem paga em dia e quer renovar contrato tem margem pra negociar.',
    'Se o contrato tá perto de vencer, dá uma olhada em aluguel mais barato ou em dividir com alguém. É chato, mas moradia é o que mais pesa.',
  ],
  contas: [
    'Liga pra operadora e pergunta qual o plano mais barato de hoje. Quase sempre tem um melhor que o seu, eles só não te avisam.',
    'Fala que você tá pensando em cancelar. O pessoal da retenção libera desconto que o atendimento normal nem oferece.',
    'Banho mais curto, luz apagada e aparelho fora da tomada. Parece besteira, mas aparece na conta.',
  ],
  mercado: [
    'Vai uma vez por semana, com lista. Cada ida extra é dinheiro saindo sem você perceber.',
    'Nunca vá com fome. Essa é regra de ouro, senão o carrinho enche de porcaria.',
    'Compara o preço por quilo e dá uma chance pra marca própria. O gosto é quase igual, o preço não.',
  ],
  transporte: [
    'Abastece sempre no posto mais barato do seu caminho. Dá pra ver no app antes de sair de casa.',
    'Troca duas corridas de app por semana por ônibus ou carona. Só isso já dá uma diferença boa no fim do mês.',
    'Cota o seguro de novo todo ano. Renovar no automático é o jeito mais fácil de pagar caro.',
  ],
  saude: [
    'Compara seu plano com o da empresa e com os de coparticipação. Muita gente paga por cobertura que nunca usa.',
    'Pede sempre o genérico e usa os programas de desconto da farmácia. É o mesmo remédio.',
  ],
  educacao: ['Procura bolsa, curso gratuito ou plano anual. Mensalidade cheia costuma ser a opção mais cara.'],
  veiculo: [
    'Vê a portabilidade do financiamento pra outro banco com juro menor. Dá um trabalho, mas pode economizar alguns milhares.',
    'Se a parcela tá sufocando, trocar por algo mais barato não é derrota, é esperteza. Carro parado na garagem não paga boleto.',
    'Antes de quitar adiantado, pede o cálculo com desconto de juros. Só vale se a conta fechar de verdade.',
  ],
  dividas: [
    'Ataca primeiro a mais cara: rotativo do cartão e cheque especial. Os juros desses dois são absurdos.',
    'Liga e pede pra renegociar. Banco prefere receber menos do que não receber nada.',
    'Nunca pague só o mínimo da fatura. É a armadilha mais cara que existe e você não sai dela sozinho.',
  ],
  delivery: [
    'Define um teto e segura: dois pedidos por semana, por exemplo.',
    'Cozinha no domingo e congela. Durante a semana você só esquenta e economiza um dinheirão.',
    'Deixa o delivery pro fim de semana. Na semana vira hábito, e hábito come salário.',
  ],
  lazer: [
    'Separa um valor fixo por semana pra se divertir e respeita. Pode gastar, só não pode passar.',
    'Alterna com programa de graça: parque, praça, evento público, encontro na casa de alguém. Dá pra se divertir sem torrar.',
  ],
  compras: [
    'Regra das 48 horas: viu, quis, espera dois dias. Na maioria das vezes a vontade passa sozinha.',
    'Anota numa lista de desejos. Se no fim do mês ainda fizer sentido, compra.',
    'Desinstala os apps de loja e desliga as notificações de promoção. Promoção que você não vê não te pega.',
  ],
  assinaturas: [
    'Lista todas e cancela sem dó o que você não abriu nos últimos 30 dias.',
    'Divide plano família ou assina um por vez, revezando. Ninguém assiste cinco ao mesmo tempo.',
  ],
  cuidados: ['Espaça um pouco as idas ao salão e compara preço. Produto em refil sai bem mais barato.'],
  outros: ['Vale detalhar esses gastos em categorias certas. O que não tem nome é o que mais escapa.'],
};

/** Excessos menores que R$ 20 não geram plano de redução. */
const MIN_GAP_CENTS = 2000;

const FEES_RE = /juros|iof|encargo|multa|\bmora\b|tarifa|anuidade|cesta de servi|taxa de manuten/i;

const SEVERITY_ORDER: Record<TipSeverity, number> = { alerta: 0, atencao: 1, info: 2, positivo: 3 };


export interface Subscription {
  /** Nome como aparece no extrato (o do lançamento mais recente). */
  name: string;
  monthlyCents: number;
}

/** Assinaturas = gastos da categoria "assinaturas" que se repetem em 2+ meses com valor parecido. */
export function detectSubscriptions(txs: Transaction[], endMonth: string): Subscription[] {
  const months = [endMonth, shiftMonth(endMonth, -1), shiftMonth(endMonth, -2)];
  // Agrupa pelo nome normalizado, mas guarda o texto original para mostrar na tela.
  const byName = new Map<string, { label: string; lastDate: string; perMonth: Map<string, number> }>();
  for (const t of txs) {
    if (t.type !== 'expense' || t.categoryId !== 'assinaturas') continue;
    const m = monthKey(t.date);
    if (!months.includes(m)) continue;
    const key = groupingKey(t.description) || 'assinatura';
    const entry = byName.get(key) ?? { label: t.description, lastDate: t.date, perMonth: new Map<string, number>() };
    if (t.date >= entry.lastDate) {
      entry.label = t.description;
      entry.lastDate = t.date;
    }
    entry.perMonth.set(m, (entry.perMonth.get(m) ?? 0) + t.amountCents);
    byName.set(key, entry);
  }
  const out: Subscription[] = [];
  for (const { label, perMonth } of byName.values()) {
    if (perMonth.size < 2) continue;
    const values = [...perMonth.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (min / max < 0.85) continue;
    out.push({ name: label.trim(), monthlyCents: Math.round(values.reduce((a, b) => a + b, 0) / values.length) });
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
  const tips: Tip[] = [];
  const base = summary.baseIncomeCents;

  if (base <= 0) {
    tips.push({
      id: 'sem-renda',
      severity: 'info',
      title: 'Me conta quanto você ganha',
      message: 'Sem saber sua renda eu não consigo te dizer quanto dá pra gastar em cada coisa. É rapidinho.',
      savingsCents: 0,
      steps: ['Abre a tela "Minha renda" e preenche o que cai na sua conta por mês. Leva 30 segundos.'],
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
    const isFixed = FIXED_COST_CATEGORIES.has(u.category.id);
    // Gasto variável dá para reduzir aos poucos; custo fixo só muda com renegociação.
    const plan = isFixed
      ? [
          `Essa é conta fixa, então não adianta eu mandar cortar ${formatBRL(third)} no mês que vem: não dá, tá no contrato.`,
          `O excesso é ${formatBRL(gap)} por mês. É exatamente isso que você ganha se renegociar ou trocar de plano.`,
          'Enquanto isso não rola, compensa apertando o que é variável: delivery, compras e lazer.',
        ]
      : [
          `Mês 1: corta ${formatBRL(third)}. É um terço do excesso, dá pra fazer sem sofrer.`,
          `Mês 2: corta mais ${formatBRL(third)}, somando ${formatBRL(third * 2)}.`,
          `Mês 3: chega em ${formatBRL(u.limitCents)} e pronto: são ${formatBRL(gap)} sobrando todo mês.`,
        ];
    tips.push({
      id: `over:${u.category.id}`,
      severity: u.ratio > 1.3 ? 'alerta' : 'atencao',
      categoryId: u.category.id,
      title: `${u.category.name} tá ${pct}% acima do que cabe`,
      message: isFixed
        ? `Você gastou ${formatBRL(u.spentCents)} e o que caberia na sua renda é ${formatBRL(u.limitCents)}. Como é conta fixa, esses ${formatBRL(gap)} a mais só somem renegociando.`
        : `Você gastou ${formatBRL(u.spentCents)} e o que caberia é ${formatBRL(u.limitCents)}. Ajustando isso, sobram ${formatBRL(gap)} todo mês no seu bolso.`,
      savingsCents: gap,
      steps: [...plan, ...(ADVICE[u.category.id] ?? [])],
    });
  }

  /*
   * 2) Crescimento em relação ao mês anterior.
   * Comparamos o mesmo pedaço do mês (dia 1 até hoje) em vez de ratear o total
   * do mês passado: uma assinatura cobrada todo dia 5 não é "aumento" só porque
   * hoje é dia 12 e o rateio esperava um terço dela.
   */
  const prevMonth = shiftMonth(month, -1);
  const cutoffDay = month === currentMonthKey(now) ? now.getDate() : 31;
  const samePeriod = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'expense' || monthKey(t.date) !== prevMonth) continue;
    if (Number(t.date.slice(8, 10)) > cutoffDay) continue;
    samePeriod.set(t.categoryId, (samePeriod.get(t.categoryId) ?? 0) + t.amountCents);
  }
  for (const u of summary.categories) {
    if (u.category.group === 'poupanca' || flaggedOver.has(u.category.id)) continue;
    const before = samePeriod.get(u.category.id) ?? 0;
    const diff = u.spentCents - before;
    if (before > 0 && diff >= 5000 && u.spentCents >= before * 1.25) {
      tips.push({
        id: `growth:${u.category.id}`,
        severity: 'atencao',
        categoryId: u.category.id,
        title: `${u.category.name} disparou esse mês`,
        message: `Você já gastou ${formatBRL(u.spentCents)} contra ${formatBRL(before)} no mesmo período do mês passado. São ${formatBRL(diff)} a mais.`,
        savingsCents: diff,
        steps: [
          'Abre os lançamentos e vê o que mudou: foi uma compra única ou virou hábito novo?',
          ...(ADVICE[u.category.id]?.slice(0, 2) ?? []),
        ],
      });
    }
  }

  // 3) Assinaturas recorrentes.
  const subs = detectSubscriptions(txs, month);
  if (subs.length >= 2) {
    const total = subs.reduce((a, s) => a + s.monthlyCents, 0);
    // Promessa conservadora: o mínimo garantido ao cancelar uma é o valor da mais barata.
    const cheapest = Math.min(...subs.map((s) => s.monthlyCents));
    const dearest = Math.max(...subs.map((s) => s.monthlyCents));
    tips.push({
      id: 'assinaturas',
      severity: 'info',
      categoryId: 'assinaturas',
      title: `${subs.length} assinaturas comendo ${formatBRL(total)} por mês`,
      message: `Isso dá ${formatBRL(total * 12)} no ano. Cancelando uma só você já guarda de ${formatBRL(cheapest)} a ${formatBRL(dearest)} por mês. Qual delas você abriu essa semana mesmo?`,
      savingsCents: cheapest,
      steps: [
        ...subs.slice(0, 5).map((s) => `${s.name}: ${formatBRL(s.monthlyCents)}/mês`),
        ...ADVICE.assinaturas,
      ],
    });
  }

  // 4) Juros e tarifas.
  const feeTxs = txs.filter((t) => t.type === 'expense' && monthKey(t.date) === month && FEES_RE.test(t.description));
  const fees = feeTxs.reduce((a, t) => a + t.amountCents, 0);
  // O que já está num estouro de categoria não entra de novo na soma de economia.
  const feesNotCounted = feeTxs
    .filter((t) => !flaggedOver.has(t.categoryId))
    .reduce((a, t) => a + t.amountCents, 0);
  if (fees > 0) {
    tips.push({
      id: 'tarifas',
      severity: 'alerta',
      title: `${formatBRL(fees)} jogados fora em juros e tarifa`,
      message: 'Esse dinheiro não virou nada. Nadinha. E o pior: dá pra zerar quase tudo com umas ligações.',
      savingsCents: feesNotCounted,
      steps: [
        'Paga a fatura do cartão sempre inteira. O rotativo é o juro mais caro que existe.',
        'Liga e pede isenção da anuidade. Se não rolar, troca por um sem anuidade, tem vários.',
        'Conta digital sem tarifa resolve a cesta de serviços. Não tem motivo pra pagar isso hoje.',
        'Bota no débito automático o que vive atrasando. Multa por esquecimento é dinheiro queimado.',
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
        title: 'Opa, você tá gastando mais do que ganha',
        message: `Os gastos passaram a renda em ${formatBRL(-saved)}. Se continuar assim vai dar merda: isso vira dívida, dívida vira juros, e aí complica pra valer.`,
        savingsCents: Math.max(0, target - saved),
        steps: [
          'Corta os desejos primeiro: delivery, compras e lazer. Só até o saldo voltar pro positivo.',
          'Não parcela nada novo agora. Parcela nova é problema do seu eu do mês que vem.',
          'Olha as dicas aqui embaixo, elas mostram exatamente onde tá o rombo.',
        ],
      });
    } else if (!monthClosed) {
      // sem dica de taxa de poupança até o mês fechar
    } else if (summary.savingsRatePct < 10) {
      tips.push({
        id: 'poupanca',
        severity: 'atencao',
        title: `Tá sobrando pouco: só ${summary.savingsRatePct.toFixed(0)}%`,
        message: `O ideal é guardar 20% do que entra, que daria ${formatBRL(target)}. Hoje sobram ${formatBRL(saved)}.`,
        savingsCents: Math.max(0, target - saved),
        steps: [
          'Programa a transferência automática pro dia do salário. O que não passa pela conta você não gasta.',
          'Começa pequeno: 5% agora e sobe um ponto por mês. Daqui a um ano você nem sente.',
        ],
      });
    } else if (summary.savingsRatePct < 20) {
      tips.push({
        id: 'poupanca',
        severity: 'info',
        title: `Tá quase lá: ${summary.savingsRatePct.toFixed(0)}% guardados`,
        message: `Falta pouco, só ${formatBRL(Math.max(0, target - saved))} por mês pra bater os 20%.`,
        savingsCents: Math.max(0, target - saved),
        steps: ['Automatiza o aporte e joga nele qualquer economia das dicas aqui de cima.'],
      });
    } else {
      tips.push({
        id: 'poupanca',
        severity: 'positivo',
        title: `Mandou bem: ${summary.savingsRatePct.toFixed(0)}% guardados`,
        message: 'Tá na meta ou acima dela. É assim mesmo, segura esse ritmo.',
        savingsCents: 0,
        steps: ['Manda o que sobra pra reserva primeiro. Depois a gente pensa em prazo mais longo.'],
      });
    }
  }

  // 6) Dívidas.
  if (summary.debtRatioPct > 30) {
    tips.push({
      id: 'dividas',
      severity: 'alerta',
      categoryId: 'dividas',
      title: `Dívida tá comendo ${summary.debtRatioPct.toFixed(0)}% do seu salário`,
      message: 'Passando de 30% o orçamento fica sem folga nenhuma. Aí qualquer imprevisto vira bola de neve.',
      savingsCents: 0,
      steps: ADVICE.dividas,
    });
  }

  // 7) Reserva de emergência.
  const reserve = emergencyStatus(txs, month, settings, now);
  if (reserve.essentialCents > 0) {
    if (reserve.monthsCovered < 3) {
      tips.push({
        id: 'reserva',
        severity: reserve.monthsCovered < 1 ? 'alerta' : 'atencao',
        title: `Sua reserva dura ${reserve.monthsCovered.toFixed(1).replace('.', ',')} mês. Tá curto.`,
        message: `O ideal é ter 6 meses de custo essencial guardado, que no seu caso dá ${formatBRL(reserve.targetCents)}. Separando ${formatBRL(reserve.suggestedMonthlyCents)} por mês, em um ano você chega lá.`,
        savingsCents: 0,
        steps: [
          `Mira em ${formatBRL(reserve.suggestedMonthlyCents)} por mês. Não precisa ser perfeito, precisa ser todo mês.`,
          'Deixa num lugar de onde dá pra tirar no mesmo dia: Tesouro Selic ou CDB de liquidez diária.',
        ],
      });
    } else if (reserve.monthsCovered >= 6) {
      tips.push({
        id: 'reserva',
        severity: 'positivo',
        title: 'Reserva completa. Parabéns, sério.',
        message: 'Você já tem 6 meses ou mais de custo essencial guardado. Isso é tranquilidade, e pouca gente chega aqui.',
        savingsCents: 0,
        steps: ['Daqui pra frente, o que sobrar pode ir pra objetivo de prazo mais longo.'],
      });
    }
  }

  // 8) Projeção do mês.
  if (summary.projectedExpenseCents !== null && summary.projectedExpenseCents > base * 0.8) {
    tips.push({
      id: 'projecao',
      severity: 'atencao',
      title: 'Do jeito que tá indo, o mês fecha no vermelho',
      message: `Nesse ritmo você fecha em ${formatBRL(summary.projectedExpenseCents)}, que é ${Math.round((summary.projectedExpenseCents / base) * 100)}% da sua renda. O ideal é não passar de 80%.`,
      savingsCents: Math.max(0, summary.projectedExpenseCents - Math.round(base * 0.8)),
      steps: ['Segura a onda nos desejos até virar o mês e dá uma olhada no que tá amarelo e vermelho.'],
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


// ------------------------------------------------------------ investimentos

/*
 * Dicas de renda fixa. São informação geral sobre como o dinheiro costuma ser
 * organizado — reserva primeiro, depois prazo —, não recomendação de produto
 * nem de instituição. As regras (imposto, isenção, FGC) mudam com o tempo,
 * então cada bloco pede para conferir antes de investir.
 */

const IR_TABLE =
  'O imposto cai com o tempo: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois disso. Ou seja: quanto mais você deixa parado, mais sobra no seu bolso.';

const CONFERIR = 'Confere as taxas e as regras antes de aplicar, que isso muda direto.';

export function investmentTips(
  txs: Transaction[],
  month: string,
  settings: Settings,
  now: Date = new Date(),
): Tip[] {
  const summary = computeMonthSummary(txs, month, settings, now);
  const reserve = emergencyStatus(txs, month, settings, now);
  const tips: Tip[] = [];
  const base = summary.totalResourcesCents;
  if (base <= 0) return tips;

  const leftover = base - summary.expenseCents - summary.investedCents;

  // 1) Enquanto a reserva não está pronta, ela é o único destino.
  if (reserve.monthsCovered < 6 && reserve.essentialCents > 0) {
    tips.push({
      id: 'inv-reserva',
      kind: 'investimento',
      severity: reserve.monthsCovered < 3 ? 'atencao' : 'info',
      title: 'Onde guardar a sua reserva',
      message: `Faltam ${formatBRL(Math.max(0, reserve.targetCents - reserve.balanceCents))} pros 6 meses. Reserva tem que fazer duas coisas: render todo dia e sair na hora que você precisar.`,
      savingsCents: 0,
      steps: [
        'Tesouro Selic: título do governo, acompanha a Selic e você saca quando quiser. É o jeito mais simples de começar.',
        'CDB de liquidez diária pagando perto de 100% do CDI ou mais. Tem garantia do FGC até R$ 250 mil por banco e por CPF, então é seguro.',
        'Tira da poupança. Com a Selic alta ela rende menos que as opções acima, é dinheiro parado perdendo valor.',
        'Nada de previdência ou fundo com carência pra reserva. Se você não consegue sacar hoje, não é reserva.',
        CONFERIR,
      ],
    });
  }

  // 2) Reserva pronta: a conversa passa a ser prazo.
  if (reserve.monthsCovered >= 6) {
    tips.push({
      id: 'inv-prazo',
      kind: 'investimento',
      severity: 'positivo',
      title: 'Reserva feita. Agora é escolher o prazo.',
      message: 'Com a emergência coberta, o jogo muda: cada dinheiro vai pro prazo dele. Quanto mais tempo você aguenta deixar, mais rende.',
      savingsCents: 0,
      steps: [
        'Dinheiro pra até 2 anos (viagem, trocar de carro): CDB, LCI ou LCA pós-fixado, em % do CDI. LCI e LCA hoje não pagam imposto de renda pra pessoa física.',
        'Dinheiro pra 5 anos ou mais (aposentadoria, entrada de imóvel): Tesouro IPCA+ garante ganho acima da inflação, desde que você segure até o vencimento.',
        IR_TABLE,
        'Compara sempre pelo líquido. Um CDB de 110% do CDI com imposto pode render menos que uma LCI isenta de 95%. Taxa grande não quer dizer nada sozinha.',
        CONFERIR,
      ],
    });
  }

  // 3) Sobrou dinheiro e nada foi investido no mês.
  if (leftover > 20000 && summary.investedCents === 0) {
    tips.push({
      id: 'inv-parado',
      kind: 'investimento',
      severity: 'atencao',
      title: `Sobraram ${formatBRL(leftover)} parados na conta`,
      message: 'Dinheiro parado na conta corrente perde pra inflação todo mês, caladinho. Não dói na hora, mas dói.',
      savingsCents: 0,
      steps: [
        'Programa a transferência pro dia seguinte ao salário. O que não passa pela conta você não gasta.',
        'Começa pelo Tesouro Selic ou por um CDB de liquidez diária. Dá pra sacar quando quiser, então não tem risco de travar.',
        `Mesmo ${formatBRL(Math.round(leftover / 2))} por mês já constroem a reserva. O valor importa menos que fazer todo mês.`,
        CONFERIR,
      ],
    });
  }

  // 4) Já investe: o próximo passo é subir o degrau.
  if (summary.investedCents > 0) {
    const pct = (summary.investedCents / base) * 100;
    tips.push({
      id: 'inv-ritmo',
      kind: 'investimento',
      severity: 'positivo',
      title: `Você guardou ${formatBRL(summary.investedCents)} esse mês`,
      message: pct >= 20 ? `São ${pct.toFixed(0)}% da renda, tá na meta. Agora o ganho vem de escolher bem o prazo.` : `São ${pct.toFixed(0)}% da renda. Bom ritmo. Subir um ponto por mês quase não se sente no bolso.`,
      savingsCents: 0,
      steps: [
        'Uma vez por ano, confere se o que você tem ainda paga perto de 100% do CDI. Produto antigo costuma ficar pra trás e ninguém avisa.',
        'Evita resgatar antes de 180 dias. É a faixa de imposto mais alta, 22,5%, e dói à toa.',
        CONFERIR,
      ],
    });
  }

  return tips;
}
