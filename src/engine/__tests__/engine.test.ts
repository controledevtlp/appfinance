import { describe, expect, it } from 'vitest';
import {
  computeMonthSummary,
  dailySpending,
  emergencyStatus,
  essentialMonthlyCost,
  limitFor,
  mealBenefitStatus,
  monthlySeries,
  recurringMonthlyCost,
} from '../budget';
import { categorize } from '../categorizer';
import { shiftMonth, parseDateToISO } from '../dates';
import { buildDemoTransactions, DEMO_SETTINGS } from '../demo';
import { healthScore } from '../health';
import { decodeBytes, groupRecurringCandidates, parseStatement, toPreviewRows } from '../import';
import { formatBRL, parseMoneyToCents } from '../money';
import { countSameName, displayName, withAlias } from '../naming';
import { detectSubscriptions, generateTips, investmentTips } from '../tips';
import { getCategory } from '../categories';
import { DEFAULT_SETTINGS, type Settings, type Transaction } from '../types';

const NOW = new Date(2026, 10, 20); // 20/11/2026
const settings: Settings = { ...DEFAULT_SETTINGS, monthlyIncomeCents: 500000 };

let n = 0;
const tx = (date: string, description: string, reais: number, categoryId: string, type: 'income' | 'expense' = 'expense'): Transaction => ({
  id: String(++n), date, description, amountCents: Math.round(reais * 100), type, categoryId, source: 'manual',
});

describe('money', () => {
  it('formata BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(-5)).toBe('-R$ 0,05');
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00');
  });
  it('interpreta formatos brasileiros e americanos', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents('-R$ 12,30')).toBe(-1230);
    expect(parseMoneyToCents('1234.56')).toBe(123456);
    expect(parseMoneyToCents('(12,30)')).toBe(-1230);
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('50')).toBe(5000);
    expect(parseMoneyToCents('abc')).toBeNull();
  });
});

describe('dates', () => {
  it('interpreta datas', () => {
    expect(parseDateToISO('09/11/2026')).toBe('2026-11-09');
    expect(parseDateToISO('9/1/26')).toBe('2026-01-09');
    expect(parseDateToISO('2026-11-09T10:00')).toBe('2026-11-09');
    expect(parseDateToISO('31/02/2026')).toBeNull();
  });
  it('desloca meses', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 3)).toBe('2027-02');
  });
});

describe('categorizador', () => {
  it('reconhece estabelecimentos comuns', () => {
    expect(categorize('IFOOD *RESTAURANTE', 'expense')).toBe('delivery');
    expect(categorize('UBER EATS', 'expense')).toBe('delivery');
    expect(categorize('Uber *TRIP', 'expense')).toBe('transporte');
    expect(categorize('Netflix.com', 'expense')).toBe('assinaturas');
    expect(categorize('Pagamento de fatura', 'expense')).toBe('transferencia');
    expect(categorize('Mercado Livre', 'expense')).toBe('compras');
    expect(categorize('SALÁRIO EMPRESA X', 'income')).toBe('salario');
    expect(categorize('Pix qualquer', 'income')).toBe('outras_receitas');
    expect(categorize('algo desconhecido', 'expense')).toBe('outros');
  });
});

describe('importação', () => {
  it('lê fatura de cartão do Nubank (positivo = gasto)', () => {
    const csv = 'date,category,title,amount\n2026-11-02,restaurante,iFood,45.90\n2026-11-03,transporte,Uber *Trip,18.50\n2026-11-05,,Pagamento recebido,-500.00\n';
    const r = parseStatement(csv);
    expect(r.looksLikeCardInvoice).toBe(true);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0].amountCents).toBe(-4590);
    expect(r.rows[2].amountCents).toBe(50000);
    const p = toPreviewRows(r.rows, new Set());
    expect(p[2].categoryId).toBe('transferencia');
  });

  it('lê extrato com ponto-e-vírgula, preâmbulo e valores BR', () => {
    const csv = 'Extrato Conta Corrente\nConta: 1234\n\nData Lançamento;Histórico;Descrição;Valor;Saldo\n05/11/2026;Pix enviado;"Fulano de Tal";-1.234,56;5.000,00\n06/11/2026;Salário;EMPRESA LTDA;6.500,00;11.500,00\n07/11/2026;SALDO DO DIA;;;11.000,00\n';
    const r = parseStatement(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-11-05', amountCents: -123456, description: 'Pix enviado - Fulano de Tal' });
    expect(r.rows[1].amountCents).toBe(650000);
  });

  it('suporta colunas separadas de débito e crédito', () => {
    const csv = 'Data;Descrição;Débito;Crédito\n01/11/2026;Aluguel;1.650,00;\n05/11/2026;Salário;;6.500,00\n';
    const r = parseStatement(csv);
    expect(r.rows.map((x) => x.amountCents)).toEqual([-165000, 650000]);
  });

  it('lê OFX (SGML sem tags de fechamento)', () => {
    const ofx = `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261103120000[-3:BRT]\n<TRNAMT>-89.90\n<FITID>abc123\n<MEMO>COMPRA DROGASIL\n</STMTTRN>
<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261105\n<TRNAMT>6500.00\n<FITID>abc124\n<NAME>SALARIO\n</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseStatement(ofx);
    expect(r.format).toBe('ofx');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-11-03', amountCents: -8990, bankId: 'abc123', description: 'COMPRA DROGASIL' });
    const p = toPreviewRows(r.rows, new Set(['bank:abc123']));
    expect(p[0].duplicate).toBe(true);
    expect(p[1].duplicate).toBe(false);
    expect(p[1].type).toBe('income');
  });

  it('gera ids estáveis, mesmo com linhas idênticas no mesmo dia', () => {
    const csv = 'Data;Descrição;Valor\n01/11/2026;Café;-8,00\n01/11/2026;Café;-8,00\n';
    const a = toPreviewRows(parseStatement(csv).rows, new Set());
    const b = toPreviewRows(parseStatement(csv).rows, new Set(a.map((x) => x.externalId!)));
    expect(a[0].externalId).not.toBe(a[1].externalId);
    expect(b.every((x) => x.duplicate)).toBe(true);
  });

  it('decodifica Latin-1 quando não é UTF-8', () => {
    const latin1 = new Uint8Array([0x53, 0x61, 0x6c, 0xe1, 0x72, 0x69, 0x6f]); // "Salário" em Latin-1
    expect(decodeBytes(latin1)).toBe('Salário');
    expect(decodeBytes(new TextEncoder().encode('Salário'))).toBe('Salário');
  });
});

describe('orçamento', () => {
  const txs = [
    tx('2026-11-05', 'Salário', 5000, 'salario', 'income'),
    tx('2026-11-10', 'Aluguel', 1000, 'moradia'),
    tx('2026-11-11', 'iFood', 600, 'delivery'), // ideal 7% de 5000 = 350
    tx('2026-11-12', 'Aplicação CDB', 400, 'investimentos'),
    tx('2026-11-13', 'Pagamento de fatura', 900, 'transferencia'),
    tx('2026-11-14', 'Mercado', 480, 'mercado'), // limite 500 -> 96% = warning
  ];
  const s = computeMonthSummary(txs, '2026-11', settings, NOW);

  it('calcula totais ignorando transferências e separando investimentos', () => {
    expect(s.incomeCents).toBe(500000);
    expect(s.expenseCents).toBe(208000);
    expect(s.investedCents).toBe(40000);
    expect(s.balanceCents).toBe(500000 - 208000 - 40000);
  });
  it('calcula taxa de poupança sobre a renda base', () => {
    expect(s.savingsRatePct).toBeCloseTo(58.4, 1); // (5000 - 2080) / 5000
  });
  it('aplica status por categoria', () => {
    const by = (id: string) => s.categories.find((c) => c.category.id === id)!;
    expect(by('delivery').status).toBe('over');
    expect(by('delivery').limitCents).toBe(35000);
    expect(by('mercado').status).toBe('warning');
    expect(by('moradia').status).toBe('warning'); // 1000 de 1000 = 100%
    expect(by('transporte').status).toBe('ok');
    expect(by('investimentos').status).toBe('ok');
  });
  it('respeita limites personalizados', () => {
    const s2 = computeMonthSummary(txs, '2026-11', { ...settings, budgetOverrides: { delivery: 100000 } }, NOW);
    expect(s2.categories.find((c) => c.category.id === 'delivery')!.status).toBe('ok');
  });
  it('projeta o gasto do mês corrente sem repetir conta fixa', () => {
    // Fixo já pago (aluguel 1000) entra uma vez; variável (mercado 480 + iFood 600) segue o ritmo diário.
    expect(s.projectedExpenseCents).toBe(100000 + Math.round((108000 / 20) * 30));
    expect(computeMonthSummary(txs, '2026-10', settings, NOW).projectedExpenseCents).toBeNull();
  });
  it('usa a renda lançada quando a renda declarada é zero', () => {
    const s3 = computeMonthSummary(txs, '2026-11', DEFAULT_SETTINGS, NOW);
    expect(s3.baseIncomeCents).toBe(500000);
  });
  it('gera série mensal', () => {
    const series = monthlySeries(txs, '2026-11', 3);
    expect(series.map((p) => p.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(series[2]).toMatchObject({ incomeCents: 500000, expenseCents: 208000 });
  });
  it('calcula reserva de emergência', () => {
    // Novembro é o mês em andamento aqui, então não serve de base: cai para 50% da renda declarada.
    const r = emergencyStatus(txs, '2026-11', { ...settings, emergencyBalanceCents: 300000 }, NOW);
    expect(r.essentialCents).toBe(250000);
    expect(r.targetCents).toBe(1500000);
    expect(r.monthsCovered).toBeCloseTo(1.2, 1);
  });
});

describe('dicas', () => {
  const txs = [
    tx('2026-11-05', 'Salário', 5000, 'salario', 'income'),
    tx('2026-11-11', 'iFood', 600, 'delivery'),
    tx('2026-11-15', 'Juros rotativo', 50, 'dividas'),
    ...['2026-09', '2026-10', '2026-11'].flatMap((m) => [
      tx(`${m}-07`, 'Netflix', 55.9, 'assinaturas'),
      tx(`${m}-08`, 'Spotify', 21.9, 'assinaturas'),
    ]),
  ];
  const tips = generateTips(txs, '2026-11', settings, NOW);

  it('cria plano de redução em 3 etapas para categoria estourada', () => {
    const t = tips.find((x) => x.id === 'over:delivery')!;
    expect(t.savingsCents).toBe(25000);
    expect(t.severity).toBe('alerta');
    expect(t.steps[0]).toContain('Mês 1');
    expect(t.steps[2]).toContain('Mês 3');
  });
  it('detecta assinaturas recorrentes', () => {
    expect(detectSubscriptions(txs, '2026-11').map((s) => s.name)).toEqual(['Netflix', 'Spotify']);
    expect(tips.some((t) => t.id === 'assinaturas')).toBe(true);
  });
  it('alerta sobre juros e tarifas', () => {
    expect(tips.find((t) => t.id === 'tarifas')?.savingsCents).toBe(5000);
  });
  it('pede a renda quando não há dados', () => {
    const t = generateTips([], '2026-11', DEFAULT_SETTINGS, NOW);
    expect(t).toHaveLength(1);
    expect(t[0].id).toBe('sem-renda');
  });
  it('ordena por gravidade', () => {
    const order = { alerta: 0, atencao: 1, info: 2, positivo: 3 };
    for (let i = 1; i < tips.length; i++) expect(order[tips[i - 1].severity]).toBeLessThanOrEqual(order[tips[i].severity]);
  });
});

describe('saúde financeira', () => {
  it('retorna nota explicada ou null sem dados', () => {
    expect(healthScore(computeMonthSummary([], '2026-11', DEFAULT_SETTINGS, NOW), emergencyStatus([], '2026-11', DEFAULT_SETTINGS))).toBeNull();
    const txs = [tx('2026-11-05', 'Salário', 5000, 'salario', 'income'), tx('2026-11-10', 'Aluguel', 1000, 'moradia')];
    const h = healthScore(computeMonthSummary(txs, '2026-11', settings, NOW), emergencyStatus(txs, '2026-11', { ...settings, emergencyBalanceCents: 1200000 }))!;
    expect(h.score).toBeGreaterThan(80);
    expect(h.parts.reduce((a, p) => a + p.max, 0)).toBe(100);
  });
});

describe('dados de demonstração', () => {
  it('geram dicas e nota coerentes', () => {
    const demo = buildDemoTransactions(NOW).map((t, i) => ({ ...t, id: String(i) }));
    // Mês fechado: os excessos propositais da demonstração aparecem independentemente do dia de hoje.
    const s = computeMonthSummary(demo, '2026-10', DEMO_SETTINGS, NOW);
    expect(s.incomeCents).toBeGreaterThan(0);
    const tips = generateTips(demo, '2026-10', DEMO_SETTINGS, NOW);
    expect(tips.some((t) => t.id === 'over:moradia')).toBe(true);
    expect(tips.some((t) => t.id === 'assinaturas')).toBe(true);
    // O cartão alimentação do exemplo (R$ 800) mantém mercado e delivery dentro do teto.
    const food = s.categories.filter((c) => c.category.id === 'mercado' || c.category.id === 'delivery');
    expect(food.every((c) => c.status !== 'over')).toBe(true);
  });
});

describe('mês em andamento e materialidade', () => {
  it('ignora estouros de menos de R$ 20', () => {
    const txs = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-10', 'Farmácia', 160.5, 'saude')]; // limite 150 -> +10,50
    expect(generateTips(txs, '2026-10', settings, NOW).some((t) => t.id === 'over:saude')).toBe(false);
  });
  it('não elogia a poupança enquanto o mês não fechou, mas avisa se já está negativo', () => {
    const ok = [tx('2026-11-05', 'Salário', 5000, 'salario', 'income'), tx('2026-11-10', 'Aluguel', 500, 'moradia')];
    expect(generateTips(ok, '2026-11', settings, NOW).some((t) => t.id === 'poupanca')).toBe(false);
    const neg = [tx('2026-11-05', 'Salário', 1000, 'salario', 'income'), tx('2026-11-10', 'Aluguel', 2000, 'moradia')];
    expect(generateTips(neg, '2026-11', { ...settings, monthlyIncomeCents: 100000 }, NOW).some((t) => t.id === 'poupanca' && t.severity === 'alerta')).toBe(true);
  });
  it('mês fechado com boa poupança recebe elogio', () => {
    const closed = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-10', 'Aluguel', 900, 'moradia')];
    expect(generateTips(closed, '2026-10', settings, NOW).find((t) => t.id === 'poupanca')?.severity).toBe('positivo');
  });
});

describe('correções de precisão', () => {
  // Mês corrente incompleto puxava a média de custos essenciais para baixo e
  // fazia a meta da reserva parecer menor do que é.
  const txs = [
    ...['2026-09', '2026-10'].flatMap((m) => [
      tx(`${m}-10`, 'Aluguel', 1500, 'moradia'),
      tx(`${m}-12`, 'Luz', 200, 'contas'),
      tx(`${m}-15`, 'Mercado', 800, 'mercado'),
    ]),
    tx('2026-11-03', 'Mercado', 150, 'mercado'), // mês corrente, aluguel ainda não venceu
  ];

  it('ignora o mês em andamento no custo essencial', () => {
    expect(essentialMonthlyCost(txs, '2026-11', settings, NOW)).toBe(250000); // média de set/out, não 150
    expect(emergencyStatus(txs, '2026-11', settings, NOW).targetCents).toBe(1500000);
  });

  it('sem mês completo, estima pela renda base (declarada ou lançada)', () => {
    const soCorrente = [tx('2026-11-03', 'Mercado', 150, 'mercado')];
    expect(essentialMonthlyCost(soCorrente, '2026-11', settings, NOW)).toBe(250000); // 50% de 5000
    const semDeclarada = [...soCorrente, tx('2026-11-05', 'Salário', 4000, 'salario', 'income')];
    expect(essentialMonthlyCost(semDeclarada, '2026-11', DEFAULT_SETTINGS, NOW)).toBe(200000);
  });

  it('mostra o nome da assinatura como veio do extrato', () => {
    const subs = detectSubscriptions(
      ['2026-09', '2026-10'].flatMap((m) => [tx(`${m}-07`, 'Netflix.com', 55.9, 'assinaturas')]),
      '2026-10',
    );
    expect(subs[0].name).toBe('Netflix.com');
  });

  it('promete o valor da assinatura mais barata, não a média', () => {
    const assinaturas = ['2026-09', '2026-10'].flatMap((m) => [
      tx(`${m}-07`, 'Netflix', 55.9, 'assinaturas'),
      tx(`${m}-08`, 'Spotify', 21.9, 'assinaturas'),
    ]);
    const t = generateTips([tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), ...assinaturas], '2026-10', settings, NOW);
    expect(t.find((x) => x.id === 'assinaturas')!.savingsCents).toBe(2190);
  });

  it('não conta juros duas vezes quando a categoria já está estourada', () => {
    const base = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income')];
    // Dívidas: limite 4% de 5000 = 200. Gasto 350, dos quais 150 são juros.
    const estourado = generateTips([...base, tx('2026-10-10', 'Parcela', 200, 'dividas'), tx('2026-10-11', 'Juros rotativo', 150, 'dividas')], '2026-10', settings, NOW);
    expect(estourado.find((x) => x.id === 'tarifas')!.savingsCents).toBe(0);
    expect(estourado.find((x) => x.id === 'over:dividas')!.savingsCents).toBe(15000);
    // Mesma tarifa numa categoria dentro do limite continua contando.
    const dentro = generateTips([...base, tx('2026-10-11', 'Anuidade cartão', 40, 'outros')], '2026-10', settings, NOW);
    expect(dentro.find((x) => x.id === 'tarifas')!.savingsCents).toBe(4000);
  });

  it('não manda cortar um terço do aluguel: custo fixo pede renegociação', () => {
    const t = generateTips([tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-10', 'Aluguel', 1500, 'moradia')], '2026-10', settings, NOW);
    const fixo = t.find((x) => x.id === 'over:moradia')!;
    expect(fixo.steps[0]).toContain('custo fixo');
    expect(fixo.steps.join(' ')).not.toContain('Mês 1');
    // Gasto variável mantém o plano de 3 meses.
    const variavel = generateTips([tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-11', 'iFood', 600, 'delivery')], '2026-10', settings, NOW);
    expect(variavel.find((x) => x.id === 'over:delivery')!.steps[0]).toContain('Mês 1');
  });
});

describe('projeção e comparação mês a mês', () => {
  const salario = (m: string) => tx(`${m}-05`, 'Salário', 5000, 'salario', 'income');

  it('antecipa a conta fixa que ainda não venceu, usando o mês anterior', () => {
    const txs = [
      salario('2026-10'),
      tx('2026-10-10', 'Aluguel', 1200, 'moradia'),
      salario('2026-11'),
      tx('2026-11-02', 'Mercado', 300, 'mercado'), // dia 20: aluguel de novembro ainda não lançado
    ];
    const s = computeMonthSummary(txs, '2026-11', settings, NOW);
    // 120000 (aluguel esperado) + 30000/20*30 (mercado no ritmo) = 165000
    expect(s.projectedExpenseCents).toBe(120000 + Math.round((30000 / 20) * 30));
  });

  it('não acusa aumento quando a cobrança mensal apenas já caiu neste mês', () => {
    const txs = [
      salario('2026-10'),
      tx('2026-10-05', 'Academia', 110, 'saude'),
      tx('2026-10-25', 'Dentista', 400, 'saude'), // fora do período comparável (dia 25 > 20)
      salario('2026-11'),
      tx('2026-11-05', 'Academia', 110, 'saude'),
    ];
    expect(generateTips(txs, '2026-11', settings, NOW).some((t) => t.id === 'growth:saude')).toBe(false);
  });

  it('acusa aumento real no mesmo período', () => {
    const txs = [
      salario('2026-10'),
      tx('2026-10-05', 'Mercado', 200, 'mercado'),
      salario('2026-11'),
      tx('2026-11-05', 'Mercado', 200, 'mercado'),
      tx('2026-11-08', 'Mercado', 300, 'mercado'),
    ];
    const t = generateTips(txs, '2026-11', settings, NOW).find((x) => x.id === 'growth:mercado')!;
    expect(t.savingsCents).toBe(30000);
    expect(t.message).toContain('mesmo período');
  });
});

describe('gastos constantes e ritmo do mês', () => {
  it('agrupa candidatos a gasto constante e pré-marca o que repete', () => {
    const rows = [
      { date: '2026-09-10', description: 'ALUGUEL IMOBILIARIA', amountCents: 150000, type: 'expense' as const, categoryId: 'moradia' },
      { date: '2026-10-10', description: 'ALUGUEL IMOBILIARIA', amountCents: 150000, type: 'expense' as const, categoryId: 'moradia' },
      { date: '2026-10-03', description: 'IFOOD *PEDIDO', amountCents: 5490, type: 'expense' as const, categoryId: 'delivery' },
      { date: '2026-10-06', description: 'Pagamento de fatura', amountCents: 120000, type: 'expense' as const, categoryId: 'transferencia' },
      { date: '2026-10-07', description: 'NETFLIX.COM', amountCents: 5590, type: 'expense' as const, categoryId: 'assinaturas' },
    ];
    const groups = groupRecurringCandidates(rows);
    const by = (k: string) => groups.find((g) => g.key.includes(k))!;
    expect(groups.map((g) => g.suggested)).toEqual([true, true, false]); // transferência fica de fora
    expect(by('aluguel')).toMatchObject({ months: 2, monthlyCents: 150000, indexes: [0, 1] });
    expect(by('netflix').suggested).toBe(true); // 1 mês só, mas categoria tipicamente fixa
    expect(by('ifood').suggested).toBe(false);
  });

  it('junta as parcelas de um mesmo compromisso e soma repetições do mês', () => {
    const rows = [
      { date: '2026-09-20', description: 'NOTEBOOK PARCELA 3/10', amountCents: 34000, type: 'expense' as const, categoryId: 'dividas' },
      { date: '2026-10-20', description: 'NOTEBOOK PARCELA 4/10', amountCents: 34000, type: 'expense' as const, categoryId: 'dividas' },
      { date: '2026-10-05', description: 'Uber', amountCents: 2000, type: 'expense' as const, categoryId: 'transporte' },
      { date: '2026-10-09', description: 'Uber', amountCents: 3000, type: 'expense' as const, categoryId: 'transporte' },
    ];
    const groups = groupRecurringCandidates(rows);
    const parcela = groups.find((g) => g.key.includes('notebook'))!;
    expect(parcela).toMatchObject({ months: 2, monthlyCents: 34000, suggested: true });
    expect(parcela.label).toBe('NOTEBOOK PARCELA 4/10'); // o mais recente
    const uber = groups.find((g) => g.key === 'uber')!;
    expect(uber.monthlyCents).toBe(5000); // somou os dois do mesmo mês
    expect(uber.months).toBe(1);
  });

  it('calcula o acumulado diário contra o ritmo ideal', () => {
    const txs = [
      tx('2026-11-01', 'Mercado', 100, 'mercado'),
      tx('2026-11-03', 'iFood', 50, 'delivery'),
      tx('2026-11-03', 'Aplicação', 500, 'investimentos'), // aporte não é gasto
      tx('2026-11-05', 'Salário', 5000, 'salario', 'income'),
    ];
    const pts = dailySpending(txs, '2026-11', 300000, NOW); // orçamento 3000, novembro tem 30 dias
    expect(pts).toHaveLength(20); // vai só até hoje (dia 20)
    expect(pts[0]).toEqual({ day: 1, cumulativeCents: 10000, paceCents: 10000 });
    expect(pts[2].cumulativeCents).toBe(15000);
    expect(pts[19]).toMatchObject({ day: 20, cumulativeCents: 15000, paceCents: 200000 });
  });

  it('trata lançamento marcado como recorrente igual a conta fixa na projeção', () => {
    const base = [
      tx('2026-10-05', 'Salário', 5000, 'salario', 'income'),
      { ...tx('2026-10-08', 'Seguro do carro', 300, 'transporte'), recurring: true },
      tx('2026-11-05', 'Salário', 5000, 'salario', 'income'),
      tx('2026-11-02', 'Mercado', 200, 'mercado'),
    ];
    // Seguro (recorrente, ainda não lançado em novembro) é antecipado uma vez;
    // mercado (R$ 200 até o dia 20) segue o ritmo: 20000/20*30 = 30000.
    expect(computeMonthSummary(base, '2026-11', settings, NOW).projectedExpenseCents).toBe(30000 + 30000);
    expect(recurringMonthlyCost(base, '2026-10')).toBe(30000);
  });
});

describe('ajustes de leitura do extrato', () => {
  it('descarta o "Débito/Crédito" genérico da descrição', () => {
    const csv = 'Data;Histórico;Descrição;Valor\n10/10/2026;Débito;ALUGUEL IMOBILIARIA;-1.650,00\n05/10/2026;Crédito;SALARIO;6.500,00\n';
    expect(parseStatement(csv).rows.map((r) => r.description)).toEqual(['ALUGUEL IMOBILIARIA', 'SALARIO']);
  });

  it('mantém o histórico quando ele é a única informação', () => {
    const csv = 'Data;Histórico;Valor\n10/10/2026;Pix enviado;-50,00\n';
    expect(parseStatement(csv).rows[0].description).toBe('Pix enviado');
  });

  it('não sugere gasto variável como constante, mesmo repetindo', () => {
    const rows = [
      { date: '2026-10-03', description: 'IFOOD *PEDIDO', amountCents: 5490, type: 'expense' as const, categoryId: 'delivery' },
      { date: '2026-11-09', description: 'IFOOD *PEDIDO', amountCents: 6140, type: 'expense' as const, categoryId: 'delivery' },
      { date: '2026-10-10', description: 'ALUGUEL', amountCents: 165000, type: 'expense' as const, categoryId: 'moradia' },
      { date: '2026-11-10', description: 'ALUGUEL', amountCents: 165000, type: 'expense' as const, categoryId: 'moradia' },
    ];
    const g = groupRecurringCandidates(rows);
    expect(g.find((x) => x.key.includes('ifood'))!.suggested).toBe(false);
    expect(g.find((x) => x.key.includes('aluguel'))!.suggested).toBe(true);
  });

  it('classifica parcelamento sem lojista como dívida', () => {
    expect(categorize('NOTEBOOK PARCELA 3/10', 'expense')).toBe('dividas');
    expect(categorize('MAGAZINE LUIZA PARC 2/3', 'expense')).toBe('compras');
  });
});

describe('cartão alimentação', () => {
  // Renda livre 5000 + benefício 800. Mercado ideal 10%, alimentação fora 7%.
  const comBeneficio: Settings = { ...settings, mealBenefitCents: 80000 };

  it('aumenta só o teto de mercado e alimentação fora, na proporção dos ideais', () => {
    const mercado = limitFor(getCategory('mercado'), 500000, comBeneficio);
    const delivery = limitFor(getCategory('delivery'), 500000, comBeneficio);
    expect(mercado).toBe(50000 + Math.round((80000 * 10) / 17));
    expect(delivery).toBe(35000 + Math.round((80000 * 7) / 17));
    // O benefício não paga aluguel: moradia continua em 20% da renda livre.
    expect(limitFor(getCategory('moradia'), 500000, comBeneficio)).toBe(100000);
  });

  it('não infla a renda livre, mas conta no quanto sobrou', () => {
    const txs = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-15', 'Mercado', 1000, 'mercado')];
    const s = computeMonthSummary(txs, '2026-10', comBeneficio, NOW);
    expect(s.baseIncomeCents).toBe(500000); // ideais continuam saindo da renda livre
    expect(s.benefitCents).toBe(80000);
    expect(s.totalResourcesCents).toBe(580000);
    // Sem o benefício na conta, gastar 1000 em mercado pareceria pior do que é.
    expect(s.savingsRatePct).toBeCloseTo(((580000 - 100000) / 580000) * 100, 1);
    expect(s.groups.find((g) => g.group === 'necessidades')!.idealCents).toBe(250000);
  });

  it('acompanha quanto do benefício já foi usado', () => {
    const txs = [tx('2026-10-10', 'Carrefour', 600, 'mercado'), tx('2026-10-11', 'iFood', 150, 'delivery'), tx('2026-10-12', 'Uber', 80, 'transporte')];
    const b = mealBenefitStatus(txs, '2026-10', comBeneficio);
    expect(b.spentCents).toBe(75000); // transporte não usa o cartão
    expect(b.remainingCents).toBe(5000);
    expect(b.progress).toBeCloseTo(0.9375, 3);
  });

  it('sem benefício informado, nada muda', () => {
    expect(limitFor(getCategory('mercado'), 500000, settings)).toBe(50000);
    expect(mealBenefitStatus([], '2026-10', settings)).toMatchObject({ limitCents: 0, progress: 0 });
  });
});

describe('mês de destino depois da importação', () => {
  // A regra usada na tela de importação: cai no mês com mais lançamentos e,
  // em caso de empate, no mais recente.
  const busiestMonth = (dates: string[]) => {
    const months = new Map<string, number>();
    for (const d of dates) {
      const m = d.slice(0, 7);
      months.set(m, (months.get(m) ?? 0) + 1);
    }
    return [...months.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0];
  };

  it('escolhe o mês com mais lançamentos', () => {
    expect(busiestMonth(['2026-10-05', '2026-10-10', '2026-11-02'])).toBe('2026-10');
  });
  it('no empate, fica com o mais recente', () => {
    expect(busiestMonth(['2026-09-05', '2026-10-10'])).toBe('2026-10');
  });
});

describe('apelidos e dicas de investimento', () => {
  it('apelido vale para todos os lançamentos iguais, inclusive parcelas', () => {
    const aliases = withAlias({}, 'ENEL DISTRIBUICAO SP 0001', 'Conta de luz');
    expect(displayName('ENEL DISTRIBUICAO SP 0001', aliases)).toBe('Conta de luz');
    expect(displayName('ENEL DISTRIBUICAO SP 0002', aliases)).toBe('Conta de luz'); // números não contam na chave
    expect(displayName('OUTRA COISA', aliases)).toBe('OUTRA COISA');
  });

  it('apagar o apelido volta ao nome do extrato', () => {
    const a1 = withAlias({}, 'NETFLIX.COM', 'Netflix');
    expect(displayName('NETFLIX.COM', withAlias(a1, 'NETFLIX.COM', '  '))).toBe('NETFLIX.COM');
  });

  it('conta quantos lançamentos o apelido afeta', () => {
    const txs = [tx('2026-10-07', 'NETFLIX.COM 01', 55.9, 'assinaturas'), tx('2026-11-07', 'NETFLIX.COM 02', 55.9, 'assinaturas'), tx('2026-11-08', 'Spotify', 21.9, 'assinaturas')];
    expect(countSameName(txs, 'NETFLIX.COM 03')).toBe(2);
  });

  it('sem reserva, a dica de investimento é sobre onde deixar a reserva', () => {
    const txs = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-10', 'Aluguel', 1000, 'moradia')];
    const inv = investmentTips(txs, '2026-10', settings, NOW);
    const r = inv.find((t) => t.id === 'inv-reserva')!;
    expect(r.kind).toBe('investimento');
    expect(r.steps.join(' ')).toContain('Tesouro Selic');
    expect(inv.some((t) => t.id === 'inv-prazo')).toBe(false);
  });

  it('com reserva completa, a dica passa a ser prazo', () => {
    const txs = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-10', 'Aluguel', 1000, 'moradia')];
    const comReserva = { ...settings, emergencyBalanceCents: 10000000 };
    const inv = investmentTips(txs, '2026-10', comReserva, NOW);
    expect(inv.some((t) => t.id === 'inv-prazo')).toBe(true);
    expect(inv.some((t) => t.id === 'inv-reserva')).toBe(false);
  });

  it('avisa quando sobra dinheiro e nada foi investido', () => {
    const txs = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-10', 'Aluguel', 500, 'moradia')];
    expect(investmentTips(txs, '2026-10', settings, NOW).some((t) => t.id === 'inv-parado')).toBe(true);
    const investiu = [...txs, tx('2026-10-12', 'CDB', 1000, 'investimentos')];
    const inv = investmentTips(investiu, '2026-10', settings, NOW);
    expect(inv.some((t) => t.id === 'inv-parado')).toBe(false);
    expect(inv.some((t) => t.id === 'inv-ritmo')).toBe(true);
  });

  it('toda dica de investimento pede para conferir as regras antes', () => {
    const txs = [tx('2026-10-05', 'Salário', 5000, 'salario', 'income'), tx('2026-10-10', 'Aluguel', 500, 'moradia')];
    const inv = investmentTips(txs, '2026-10', settings, NOW);
    expect(inv.length).toBeGreaterThan(0);
    for (const t of inv) expect(t.steps.some((s) => s.includes('Confirme as taxas'))).toBe(true);
  });

  it('sem renda nenhuma, não inventa dica de investimento', () => {
    expect(investmentTips([], '2026-10', DEFAULT_SETTINGS, NOW)).toHaveLength(0);
  });
});
