import { describe, expect, it } from 'vitest';
import { computeMonthSummary, emergencyStatus, monthlySeries } from '../budget';
import { categorize } from '../categorizer';
import { shiftMonth, parseDateToISO } from '../dates';
import { buildDemoTransactions, DEMO_SETTINGS } from '../demo';
import { healthScore } from '../health';
import { decodeBytes, parseStatement, toPreviewRows } from '../import';
import { formatBRL, parseMoneyToCents } from '../money';
import { detectSubscriptions, generateTips } from '../tips';
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
  it('projeta o gasto do mês corrente', () => {
    expect(s.projectedExpenseCents).toBe(Math.round((208000 / 20) * 30));
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
    const r = emergencyStatus(txs, '2026-11', { ...settings, emergencyBalanceCents: 300000 });
    expect(r.essentialCents).toBe(148000); // aluguel + mercado
    expect(r.targetCents).toBe(888000);
    expect(r.monthsCovered).toBeCloseTo(2.03, 1);
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
    expect(detectSubscriptions(txs, '2026-11').map((s) => s.name)).toEqual(['netflix', 'spotify']);
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
    expect(tips.some((t) => t.id === 'over:delivery')).toBe(true);
    expect(tips.some((t) => t.id === 'assinaturas')).toBe(true);
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
