import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractPdfLines, isPdf, parsePdf, parseStatementBytes } from '../import';

const bytesOf = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};
const strOf = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Monta um PDF de uma página, como os geradores de extrato fazem. */
function makePdf(lines: string[], { compress = true, splitText = false } = {}): Uint8Array {
  const ops = ['BT', '/F1 10 Tf', '14 TL', '1 0 0 1 40 760 Tm'];
  for (const l of lines) {
    if (splitText && l) {
      const mid = Math.floor(l.length / 2);
      ops.push(`[(${esc(l.slice(0, mid))}) -250 (${esc(l.slice(mid))})] TJ`);
    } else {
      ops.push(`(${esc(l)}) Tj`);
    }
    ops.push('T*');
  }
  ops.push('ET');
  const content = ops.join('\n');
  const data = compress ? strOf(zlibSync(bytesOf(content))) : content;
  const filter = compress ? '/Filter /FlateDecode ' : '';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< ${filter}/Length ${data.length} >>\nstream\n${data}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return bytesOf(pdf);
}

const EXTRATO = [
  'BANCO EXEMPLO S.A.    EXTRATO DE CONTA CORRENTE',
  'Agencia 1234   Conta 56789-0    Periodo: 01/10/2026 a 31/10/2026',
  'Data        Historico                          Valor        Saldo',
  '01/10/2026  SALDO ANTERIOR                                 1.200,00',
  '05/10/2026  CREDITO SALARIO EMPRESA LTDA     6.500,00 C    7.700,00',
  '07/10/2026  NETFLIX.COM                         55,90 D    7.644,10',
  '10/10/2026  ALUGUEL IMOBILIARIA SP           1.650,00 D    5.994,10',
  '18/10/2026  SUPERMERCADO CARREFOUR             287,30 D    5.524,40',
  '31/10/2026  SALDO FINAL                                    5.184,40',
];

describe('extrato em PDF', () => {
  it('reconhece o arquivo pelos bytes', () => {
    expect(isPdf(makePdf(['x']))).toBe(true);
    expect(isPdf(bytesOf('Data;Valor\n01/01/2026;10,00'))).toBe(false);
  });

  it('lê texto comprimido (FlateDecode), que é o caso normal', () => {
    const lines = extractPdfLines(makePdf(EXTRATO));
    expect(lines).toContain('07/10/2026 NETFLIX.COM 55,90 D 7.644,10');
  });

  it('lê texto não comprimido e quebrado em pedaços (operador TJ)', () => {
    const lines = extractPdfLines(makePdf(EXTRATO, { compress: false, splitText: true }));
    expect(lines.some((l) => l.includes('SUPERMERCADO CARREFOUR'))).toBe(true);
  });

  it('extrai lançamentos com sinal correto e ignora saldos', () => {
    const r = parsePdf(makePdf(EXTRATO));
    expect(r.format).toBe('pdf');
    expect(r.rows).toHaveLength(4); // saldo anterior, saldo final e cabeçalho ficam de fora
    expect(r.rows[0]).toMatchObject({ date: '2026-10-05', description: 'CREDITO SALARIO EMPRESA LTDA', amountCents: 650000 });
    expect(r.rows[1].amountCents).toBe(-5590);
    // A descrição não pode perder letras para o "R$" do valor.
    expect(r.rows[3].description).toBe('SUPERMERCADO CARREFOUR');
  });

  it('usa o primeiro valor da linha quando há coluna de saldo', () => {
    const r = parsePdf(makePdf(EXTRATO));
    expect(r.rows.find((x) => x.description.startsWith('ALUGUEL'))!.amountCents).toBe(-165000);
    expect(r.warnings.join(' ')).toContain('saldo');
  });

  it('completa o ano em datas curtas e avisa quando não há sinal', () => {
    const r = parsePdf(makePdf([
      'FATURA DO CARTAO - OUTUBRO 2026',
      '03/10  IFOOD *PEDIDO                      54,90',
      '15/10  AMAZON COM BR                     189,90',
    ]));
    expect(r.rows.map((x) => x.date)).toEqual(['2026-10-03', '2026-10-15']);
    expect(r.rows.map((x) => x.description)).toEqual(['IFOOD *PEDIDO', 'AMAZON COM BR']);
    expect(r.rows.every((x) => x.amountCents < 0)).toBe(true);
    expect(r.warnings.join(' ')).toContain('sem sinal');
  });

  it('aceita valor escrito com R$', () => {
    const r = parsePdf(makePdf(['Lancamentos', '09/11/2026  PADARIA DO BAIRRO   R$ 1.234,56']));
    expect(r.rows[0]).toMatchObject({ description: 'PADARIA DO BAIRRO', amountCents: -123456 });
  });

  it('avisa quando o PDF é digitalizado (sem texto)', () => {
    const r = parsePdf(makePdf([]));
    expect(r.rows).toHaveLength(0);
    expect(r.warnings.join(' ')).toContain('digitalizado');
  });

  it('parseStatementBytes escolhe o leitor pelo conteúdo do arquivo', () => {
    expect(parseStatementBytes(makePdf(EXTRATO)).format).toBe('pdf');
    expect(parseStatementBytes(bytesOf('Data;Descrição;Valor\n05/11/2026;Mercado;-50,00\n')).format).toBe('csv');
    expect(parseStatementBytes(bytesOf('OFXHEADER:100\n<STMTTRN>\n<DTPOSTED>20261105\n<TRNAMT>-50.00\n</STMTTRN>')).format).toBe('ofx');
  });
});
