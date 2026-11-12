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

/**
 * PDF com fonte embutida Identity-H, que é como os bancos geram hoje
 * (Nubank, por exemplo). O texto não são letras: são índices de glifo de 2
 * bytes, e quem traduz é o CMap /ToUnicode. Aqui os índices são deslocados
 * de propósito, para o teste falhar se o leitor tentar ler os bytes como ASCII.
 */
export function makeIdentityPdf(lines: PdfLine[]): Uint8Array {
  const GLYPH_OFFSET = 29;
  const used = new Set<number>();
  const collect = (txt: string) => {
    for (const ch of txt) used.add(ch.codePointAt(0)!);
  };
  for (const line of lines) {
    if (typeof line === 'string') collect(line);
    else for (const [, txt] of line.cells) collect(txt);
  }

  const gid = (code: number) => Math.max(1, code - GLYPH_OFFSET);
  const hex = (txt: string) =>
    [...txt].map((ch) => gid(ch.codePointAt(0)!).toString(16).padStart(4, '0')).join('');

  const bfchar = [...used]
    .map((code) => `<${gid(code).toString(16).padStart(4, '0')}> <${code.toString(16).padStart(4, '0')}>`)
    .join('\n');
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n${used.size} beginbfchar\n${bfchar}\nendbfchar\nendcmap\nend\nend`;

  const ops = ['BT', '/F1 9 Tf'];
  let y = 780;
  for (const line of lines) {
    const cells: [number, string][] = typeof line === 'string' ? [[40, line]] : line.cells;
    for (const [x, txt] of cells) ops.push(`1 0 0 1 ${x} ${y} Tm`, `<${hex(txt)}> Tj`);
    y -= 14;
  }
  ops.push('ET');
  const content = ops.join('\n');

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Inter /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>',
    `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Inter >>',
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
  const out = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) out[i] = pdf.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Estrutura real do extrato do Nubank, conferida contra um arquivo de verdade:
 * cada dia abre com "DD MMM AAAA" e um subtotal, os lançamentos vêm em seções
 * de "Total de entradas" e "Total de saídas", sem sinal, e os dados bancários
 * seguem em linhas de continuação que não são lançamento.
 */
export const NUBANK_REAL: PdfLine[] = [
  'Fulano de Tal',
  'CPF •••.871.467-•• Agência 0001 Conta',
  '45554965-4',
  '01 DE NOVEMBRO DE 2026 a 11 DE NOVEMBRO DE 2026 VALORES EM R$',
  'Saldo inicial 0,00',
  'Total de entradas +1.764,57',
  'R$ 7,51',
  'Total de saídas -1.613,24',
  'Saldo final do período 7,51',
  'Movimentações',
  '01 NOV 2026 Total de entradas + 100,00',
  'Transferência recebida pelo Pix FULANO DE TAL - •••.871.467-•• - 100,00',
  'MÊNTORE IP S.A. (0804) Agência: 1 Conta:',
  '79398307-0',
  'Total de saídas - 56,00',
  'Compra no débito Mandrebar 56,00',
  '02 NOV 2026 Total de saídas - 26,00',
  'Compra no débito SAUL E PIMENTA GASTROB 26,00',
  '04 NOV 2026 Total de entradas + 1.664,57',
  'Transferência recebida pelo Pix FULANO DE TAL - •••.871.467-•• - CAIXA 1.664,57',
  'ECONOMICA FEDERAL (0104) Agência: 3880 Conta:',
  '1288000000708313201-2',
  'Total de saídas - 1.531,24',
  'Transferência enviada pelo Pix BELTRANA DA SILVA - •••.189.627-•• - 1.400,00',
  'BANCO INTER (0077) Agência: 1 Conta: 16212069-9',
  'Compra no débito JIM.COM* LUCIMARA DE S 23,00',
  'Pagamento de fatura 108,24',
];
