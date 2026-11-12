import { describe, expect, it } from 'vitest';
import { extractPdfLines, parsePdf } from '../import';
import { LAYOUTS, makeBankPdf, makeIdentityPdf, NUBANK_REAL } from './bankPdf';

/**
 * Um caso por formato de extrato. Os PDFs são montados a partir do layout
 * típico de cada banco (não são arquivos reais), e o que cada um exercita é:
 * data curta, mês por extenso, cabeçalho de dia, sufixo D/C, colunas separadas
 * de crédito e débito, coluna de saldo e número de documento.
 */
const parse = (bank: keyof typeof LAYOUTS) => parsePdf(makeBankPdf(LAYOUTS[bank]));
const reais = (c: number) => c / 100;

describe('extratos em PDF dos bancos', () => {
  it('Nubank fatura: data "03 OUT" e tudo é compra', () => {
    const r = parse('nubank_fatura');
    expect(r.rows.map((x) => [x.date, x.description, reais(x.amountCents)])).toEqual([
      ['2026-10-03', 'IFOOD *PEDIDO', -54.9],
      ['2026-10-08', 'UBER *TRIP', -23.4],
      ['2026-10-15', 'AMAZON COM BR', -189.9],
    ]);
  });

  it('Nubank extrato: data no cabeçalho do dia vale para as linhas abaixo', () => {
    const r = parse('nubank_extrato');
    expect(r.rows.map((x) => x.date)).toEqual(['2026-10-05', '2026-10-10', '2026-10-10']);
    // "Transferência recebida" é entrada, mesmo sem sinal no valor.
    expect(reais(r.rows[0].amountCents)).toBe(6500);
    expect(reais(r.rows[2].amountCents)).toBe(-287.3);
  });

  it('Bradesco: colunas separadas de crédito e débito definem o sinal', () => {
    const r = parse('bradesco');
    expect(r.rows.map((x) => reais(x.amountCents))).toEqual([6500, -1650, -182.4]);
    // O número do documento não pode virar parte da descrição.
    expect(r.rows[0].description).toBe('TED RECEBIDA');
    expect(r.warnings.join(' ')).toContain('crédito e débito');
  });

  it('Banco do Brasil: sufixo D/C e coluna de saldo', () => {
    const r = parse('banco_do_brasil');
    expect(r.rows.map((x) => reais(x.amountCents))).toEqual([6500, -1650, -287.3]);
    expect(r.rows[1].description).toBe('Pagamento de Boleto');
  });

  it('Itaú: data sem ano e saldo na mesma linha', () => {
    const r = parse('itau');
    expect(r.rows.map((x) => x.date)).toEqual(['2026-10-05', '2026-10-10', '2026-10-18']);
    expect(r.rows.map((x) => reais(x.amountCents))).toEqual([6500, -1650, -287.3]);
  });

  it('Inter: valor com R$ e sinal', () => {
    const r = parse('inter');
    expect(r.rows.map((x) => reais(x.amountCents))).toEqual([6500, -1650, -54.9]);
  });

  it('Neon: mês abreviado em minúsculas', () => {
    const r = parse('neon');
    expect(r.rows.map((x) => x.date)).toEqual(['2026-10-05', '2026-10-10', '2026-10-12']);
    expect(reais(r.rows[0].amountCents)).toBe(6500);
  });

  it('Banco Pan e BrasilCard: fatura sem sinal, tudo entra como gasto', () => {
    for (const bank of ['banco_pan', 'brasilcard'] as const) {
      const r = parse(bank);
      expect(r.rows.length).toBe(2);
      expect(r.rows.every((x) => x.amountCents < 0)).toBe(true);
      expect(r.warnings.join(' ')).toContain('sem sinal');
    }
  });

  it('nenhum layout deixa passar cabeçalho, total ou saldo como lançamento', () => {
    for (const bank of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]) {
      const r = parse(bank);
      expect(r.rows.length).toBeGreaterThan(0);
      for (const row of r.rows) {
        expect(row.description).not.toMatch(/saldo|total|vencimento|hist[oó]rico|estabelecimento/i);
        expect(row.amountCents).not.toBe(0);
      }
    }
  });

  it('avisa quando o PDF está protegido por senha', () => {
    const pdf = makeBankPdf(LAYOUTS.itau);
    const withEncrypt = new Uint8Array(pdf.length + 20);
    withEncrypt.set(pdf);
    const tag = '/Encrypt 9 0 R    ';
    for (let i = 0; i < tag.length; i++) withEncrypt[pdf.length + i] = tag.charCodeAt(i);
    const r = parsePdf(withEncrypt);
    expect(r.rows).toHaveLength(0);
    expect(r.warnings.join(' ')).toContain('senha');
  });
});

/*
 * Formato real do Nubank: fonte embutida Identity-H. Sem ler o /ToUnicode o
 * texto sai cifrado ("Lucas" vira "/XFDV"), que foi o que acontecia antes.
 */
describe('Nubank real (fonte embutida Identity-H)', () => {
  const pdf = makeIdentityPdf(NUBANK_REAL);

  it('decodifica o texto pelo mapa da fonte, não pelos bytes crus', () => {
    const lines = extractPdfLines(pdf);
    expect(lines[0]).toBe('Fulano de Tal');
    expect(lines.some((l) => l.includes('Compra no débito Mandrebar'))).toBe(true);
    expect(lines.join(' ')).not.toContain('/XFDV');
  });

  it('bate com os totais que o próprio extrato declara', () => {
    const r = parsePdf(pdf);
    const entradas = r.rows.filter((x) => x.amountCents > 0).reduce((a, x) => a + x.amountCents, 0);
    const saidas = r.rows.filter((x) => x.amountCents < 0).reduce((a, x) => a - x.amountCents, 0);
    expect(entradas).toBe(176457); // "Total de entradas +1.764,57"
    expect(saidas).toBe(161324); // "Total de saídas -1.613,24"
  });

  it('usa a seção do dia para definir entrada e saída', () => {
    const rows = parsePdf(pdf).rows;
    expect(rows[0]).toMatchObject({ date: '2026-11-01', amountCents: 10000 });
    expect(rows[1]).toMatchObject({ date: '2026-11-01', description: 'Compra no débito Mandrebar', amountCents: -5600 });
    expect(rows[2].date).toBe('2026-11-02');
  });

  it('tira o CPF mascarado e os separadores repetidos da descrição', () => {
    const rows = parsePdf(pdf).rows;
    expect(rows[0].description).toBe('Transferência recebida pelo Pix FULANO DE TAL');
    expect(rows.find((r) => r.description.includes('CAIXA'))!.description).toBe(
      'Transferência recebida pelo Pix FULANO DE TAL - CAIXA',
    );
  });

  it('não confunde agência, conta e período com lançamento', () => {
    const rows = parsePdf(pdf).rows;
    expect(rows.every((r) => !/Agência|Conta:|Saldo|VALORES EM/i.test(r.description))).toBe(true);
    // "R$ 7,51" solto no resumo não é lançamento.
    expect(rows.every((r) => r.amountCents !== 751 && r.amountCents !== -751)).toBe(true);
  });

  it('avisa sobre transferências entre contas próprias', () => {
    expect(parsePdf(pdf).warnings.join(' ')).toContain('entre as suas próprias contas');
  });
});
