import { describe, expect, it } from 'vitest';
import { parsePdf } from '../import';
import { LAYOUTS, makeBankPdf } from './bankPdf';

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
    expect(r.warnings.join(' ')).toContain('colunas de crédito e débito');
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
      expect(r.warnings.join(' ')).toContain('não traziam sinal');
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
    expect(r.warnings.join(' ')).toContain('protegido por senha');
  });
});
