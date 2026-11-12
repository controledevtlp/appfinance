import { zlibSync } from 'fflate';

/** Uma linha: texto corrido, ou células posicionadas em colunas (x em pontos). */
export type PdfLine = string | { cells: [number, string][] };

const bytesOf = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};
const strOf = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/**
 * Monta um PDF de uma página como os geradores de extrato fazem: cada coluna
 * é posicionada com Tm, que é o que permite distinguir crédito de débito.
 */
export function makeBankPdf(lines: PdfLine[], { compress = true } = {}): Uint8Array {
  const ops = ['BT', '/F1 9 Tf', '14 TL'];
  let y = 780;
  for (const line of lines) {
    if (typeof line === 'string') {
      ops.push(`1 0 0 1 40 ${y} Tm`, `(${esc(line)}) Tj`);
    } else {
      for (const [x, text] of line.cells) ops.push(`1 0 0 1 ${x} ${y} Tm`, `(${esc(text)}) Tj`);
    }
    y -= 14;
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

/*
 * Layouts montados a partir do formato típico de cada banco. Não são arquivos
 * reais dos bancos: servem para travar o comportamento do leitor em cada
 * variação (data curta, mês por extenso, D/C, colunas separadas, saldo).
 */
export const LAYOUTS: Record<string, PdfLine[]> = {
  // Fatura: data "dd MMM", valor com R$ e sem sinal (tudo é compra).
  nubank_fatura: [
    'Fatura de outubro de 2026',
    'TRANSACOES',
    { cells: [[40, '03 OUT'], [110, 'IFOOD *PEDIDO'], [460, 'R$ 54,90']] },
    { cells: [[40, '08 OUT'], [110, 'UBER *TRIP'], [460, 'R$ 23,40']] },
    { cells: [[40, '15 OUT'], [110, 'AMAZON COM BR'], [460, 'R$ 189,90']] },
  ],
  // Extrato: a data vem num cabeçalho de dia e os lançamentos ficam abaixo, sem data.
  nubank_extrato: [
    'Extrato de conta - outubro 2026',
    '05 DE OUTUBRO',
    { cells: [[40, 'Transferencia recebida'], [200, 'EMPRESA LTDA'], [460, 'R$ 6.500,00']] },
    '10 DE OUTUBRO',
    { cells: [[40, 'Pagamento de boleto'], [200, 'IMOBILIARIA SP'], [460, '-R$ 1.650,00']] },
    { cells: [[40, 'Compra no debito'], [200, 'CARREFOUR'], [460, '-R$ 287,30']] },
  ],
  // Colunas separadas de crédito e débito: a posição na página define o sinal.
  bradesco: [
    'BRADESCO - EXTRATO DE CONTA CORRENTE  Outubro/2026',
    { cells: [[40, 'Data'], [100, 'Historico'], [300, 'Docto.'], [370, 'Credito (R$)'], [450, 'Debito (R$)'], [520, 'Saldo (R$)']] },
    { cells: [[40, '05/10/26'], [100, 'TED RECEBIDA'], [300, '000123'], [370, '6.500,00'], [520, '7.700,00']] },
    { cells: [[40, '10/10/26'], [100, 'PAGTO ELETRONICO ALUGUEL'], [300, '000124'], [450, '1.650,00'], [520, '6.050,00']] },
    { cells: [[40, '12/10/26'], [100, 'DEBITO AUTOMATICO ENEL'], [300, '000125'], [450, '182,40'], [520, '5.867,60']] },
  ],
  // Sufixo D/C depois do valor, e saldo também marcado.
  banco_do_brasil: [
    'Banco do Brasil - Extrato de Conta Corrente',
    'Periodo: 01/10/2026 a 31/10/2026',
    { cells: [[40, 'Dia'], [90, 'Historico'], [330, 'Valor R$'], [450, 'Saldo R$']] },
    { cells: [[40, '05/10/2026'], [90, 'Credito Salario'], [330, '6.500,00 C'], [450, '7.700,00 C']] },
    { cells: [[40, '10/10/2026'], [90, 'Pagamento de Boleto'], [330, '1.650,00 D'], [450, '6.050,00 C']] },
    { cells: [[40, '18/10/2026'], [90, 'Compra com Cartao'], [330, '287,30 D'], [450, '5.762,70 C']] },
  ],
  // Data curta e valor negativo com sinal.
  itau: [
    'Itau - extrato',
    { cells: [[40, 'data'], [90, 'lancamento'], [380, 'valor (R$)'], [470, 'saldo (R$)']] },
    { cells: [[40, '05/10'], [90, 'SALARIO EMPRESA'], [380, '6.500,00'], [470, '7.700,00']] },
    { cells: [[40, '10/10'], [90, 'PIX TRANSF IMOBILIARIA'], [380, '-1.650,00'], [470, '6.050,00']] },
    { cells: [[40, '18/10'], [90, 'COMPRA CARTAO CARREFOUR'], [380, '-287,30'], [470, '5.762,70']] },
  ],
  inter: [
    'Banco Inter - Extrato',
    { cells: [[40, 'Data'], [110, 'Descricao'], [440, 'Valor']] },
    { cells: [[40, '05/10/2026'], [110, 'Pix recebido - EMPRESA LTDA'], [440, 'R$ 6.500,00']] },
    { cells: [[40, '10/10/2026'], [110, 'Pagamento - IMOBILIARIA'], [440, '-R$ 1.650,00']] },
    { cells: [[40, '13/10/2026'], [110, 'Compra - IFOOD'], [440, '-R$ 54,90']] },
  ],
  neon: [
    'Neon - extrato de outubro',
    { cells: [[40, '05 out'], [100, 'Deposito EMPRESA LTDA'], [440, 'R$ 6.500,00']] },
    { cells: [[40, '10 out'], [100, 'Pagamento IMOBILIARIA'], [440, '-R$ 1.650,00']] },
    { cells: [[40, '12 out'], [100, 'Compra ENEL'], [440, '-R$ 182,40']] },
  ],
  banco_pan: [
    'BANCO PAN - FATURA DO CARTAO',
    'Vencimento: 10/11/2026   Total da fatura: 1.234,56',
    { cells: [[40, 'Data'], [110, 'Estabelecimento'], [450, 'Valor (R$)']] },
    { cells: [[40, '03/10/2026'], [110, 'SUPERMERCADO CARREFOUR'], [450, '287,30']] },
    { cells: [[40, '08/10/2026'], [110, 'POSTO IPIRANGA'], [450, '180,00']] },
  ],
  brasilcard: [
    'BRASILCARD DIGITAL - DEMONSTRATIVO',
    { cells: [[40, 'DATA'], [100, 'HISTORICO'], [430, 'VALOR R$']] },
    { cells: [[40, '04/10/26'], [100, 'FARMACIA PACHECO'], [430, '87,26']] },
    { cells: [[40, '09/10/26'], [100, 'PADARIA DO BAIRRO'], [430, '34,50']] },
  ],
};
