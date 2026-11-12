import { unzlibSync } from 'fflate';

/*
 * Leitor de extrato em PDF.
 *
 * Funciona com PDF de texto (o que os bancos geram). Um PDF escaneado é uma
 * imagem: não há texto para ler e nada é extraído — nesse caso o app avisa e
 * pede o CSV/OFX. Fontes com codificação própria também podem sair ilegíveis.
 */

/** Bytes -> string preservando cada byte (Latin-1), que é como o PDF se estrutura. */
function latin1(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = '';
  const CHUNK = 8192;
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + CHUNK, end))));
  }
  return out;
}

const encoder = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

// ------------------------------------------------- estrutura do arquivo PDF

interface PdfObject {
  dict: string;
  /** Posição dos bytes do stream, quando o objeto tem um. */
  streamStart?: number;
  streamEnd?: number;
}

/**
 * Indexa os objetos do arquivo ("12 0 obj ... endobj").
 *
 * Procurar a palavra "stream" solta pelo arquivo não funciona: ela aparece
 * dentro dos bytes comprimidos de fontes e imagens, e o leitor acaba
 * inflando lixo. Aqui cada stream é lido dentro do seu objeto, usando o
 * /Length declarado quando ele é um número.
 */
function parseObjects(raw: string): Map<number, PdfObject> {
  const objs = new Map<number, PdfObject>();
  const header = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = header.exec(raw))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endObj = raw.indexOf('endobj', bodyStart);
    const streamAt = raw.indexOf('stream', bodyStart);
    const hasStream = streamAt !== -1 && (endObj === -1 || streamAt < endObj);
    const dict = raw.slice(bodyStart, hasStream ? streamAt : endObj === -1 ? bodyStart + 2000 : endObj);

    let streamStart: number | undefined;
    let streamEnd: number | undefined;
    if (hasStream) {
      let start = streamAt + 'stream'.length;
      if (raw[start] === '\r') start++;
      if (raw[start] === '\n') start++;
      const declared = dict.match(/\/Length\s+(\d+)\b/);
      if (declared) {
        streamStart = start;
        streamEnd = start + Number(declared[1]);
        // /Length errado: cai para a busca pelo "endstream".
        if (raw.slice(streamEnd, streamEnd + 20).indexOf('endstream') === -1) streamEnd = undefined;
      }
      if (streamEnd === undefined) {
        const close = raw.indexOf('endstream', start);
        if (close !== -1) {
          streamStart = start;
          streamEnd = close;
          if (raw[streamEnd - 1] === '\n') streamEnd--;
          if (raw[streamEnd - 1] === '\r') streamEnd--;
        }
      }
      if (streamEnd !== undefined) header.lastIndex = streamEnd;
    }
    objs.set(num, { dict, streamStart, streamEnd });
  }
  return objs;
}

/** Bytes de um stream, já descomprimidos quando for FlateDecode. */
function streamBytes(obj: PdfObject | undefined, bytes: Uint8Array): Uint8Array | null {
  if (!obj || obj.streamStart === undefined || obj.streamEnd === undefined) return null;
  const slice = bytes.subarray(obj.streamStart, obj.streamEnd);
  if (!/\/Filter/.test(obj.dict)) return slice;
  if (!/\/FlateDecode/.test(obj.dict)) return null; // filtro que não tratamos (imagem, DCT…)
  try {
    return unzlibSync(slice);
  } catch {
    return null;
  }
}

const refIn = (dict: string, key: string): number | null => {
  const m = dict.match(new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`));
  return m ? Number(m[1]) : null;
};

/** Lê o dicionário de um valor que pode estar embutido ou ser referência. */
function dictValue(dict: string, key: string, objs: Map<number, PdfObject>): string | null {
  const ref = refIn(dict, key);
  if (ref !== null) return objs.get(ref)?.dict ?? null;
  const at = dict.indexOf(`/${key}`);
  if (at === -1) return null;
  const open = dict.indexOf('<<', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < dict.length - 1; i++) {
    if (dict[i] === '<' && dict[i + 1] === '<') {
      depth++;
      i++;
    } else if (dict[i] === '>' && dict[i + 1] === '>') {
      depth--;
      i++;
      if (depth === 0) return dict.slice(open, i + 1);
    }
  }
  return null;
}

// ------------------------------------------------------------ fontes

export interface FontInfo {
  /** Identity-H: cada caractere ocupa 2 bytes no texto. */
  twoByte: boolean;
  /** Código do glifo -> texto de verdade, lido do /ToUnicode. */
  toUnicode?: Map<number, string>;
}

/**
 * Lê um CMap /ToUnicode. É o que traduz "índice de glifo" para letra: sem
 * isso, o texto de um PDF com fonte embutida sai cifrado (o "Lucas" vira
 * "/XFDV"), porque cada fonte numera os próprios glifos.
 */
export function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  const hexToStr = (h: string) => {
    let out = '';
    for (let i = 0; i + 3 < h.length + 1; i += 4) {
      const code = parseInt(h.slice(i, i + 4), 16);
      if (!Number.isNaN(code) && code !== 0) out += String.fromCharCode(code);
    }
    return out;
  };

  for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(m[1], 16), hexToStr(m[2]));
    }
  }
  for (const block of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    // <início> <fim> <destino>
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const from = parseInt(m[1], 16);
      const to = parseInt(m[2], 16);
      const dest = parseInt(m[3], 16);
      for (let i = 0; i <= to - from && i < 65536; i++) map.set(from + i, String.fromCharCode(dest + i));
    }
    // <início> <fim> [<a> <b> <c>]
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
      const from = parseInt(m[1], 16);
      const items = [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)];
      items.forEach((it, i) => map.set(from + i, hexToStr(it[1])));
    }
  }
  return map;
}

function fontsOf(resources: string | null, objs: Map<number, PdfObject>, bytes: Uint8Array): Map<string, FontInfo> {
  const fonts = new Map<string, FontInfo>();
  if (!resources) return fonts;
  const fontDict = dictValue(resources, 'Font', objs);
  if (!fontDict) return fonts;

  for (const m of fontDict.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g)) {
    const font = objs.get(Number(m[2]));
    if (!font) continue;
    const twoByte = /\/Type0\b/.test(font.dict) || /\/Identity-?H/.test(font.dict);
    const toUniRef = refIn(font.dict, 'ToUnicode');
    let toUnicode: Map<number, string> | undefined;
    if (toUniRef !== null) {
      const data = streamBytes(objs.get(toUniRef), bytes);
      if (data) toUnicode = parseToUnicode(latin1(data));
    }
    fonts.set(m[1], { twoByte, toUnicode });
  }
  return fonts;
}

// ------------------------------------------------------------ páginas

interface Page {
  content: string;
  fonts: Map<string, FontInfo>;
}

function pagesOf(bytes: Uint8Array): Page[] {
  const raw = latin1(bytes);
  const objs = parseObjects(raw);
  const pages: Page[] = [];

  for (const obj of objs.values()) {
    if (!/\/Type\s*\/Page\b/.test(obj.dict)) continue;

    // /Contents pode ser um objeto ou um vetor deles.
    const refs: number[] = [];
    const single = refIn(obj.dict, 'Contents');
    if (single !== null) refs.push(single);
    else {
      const arr = obj.dict.match(/\/Contents\s*\[([^\]]*)\]/);
      if (arr) for (const m of arr[1].matchAll(/(\d+)\s+\d+\s+R/g)) refs.push(Number(m[1]));
    }

    let content = '';
    for (const r of refs) {
      const data = streamBytes(objs.get(r), bytes);
      if (data) content += latin1(data) + '\n';
    }
    if (!content) continue;

    const resources = dictValue(obj.dict, 'Resources', objs);
    pages.push({ content, fonts: fontsOf(resources, objs, bytes) });
  }

  // Sem nenhuma página reconhecida, tenta todos os streams como conteúdo.
  if (!pages.length) {
    for (const obj of objs.values()) {
      const data = streamBytes(obj, bytes);
      if (data && /\bBT\b/.test(latin1(data.subarray(0, 2000)))) {
        pages.push({ content: latin1(data), fonts: new Map() });
      }
    }
  }
  return pages;
}

const OCTAL = /\\([0-7]{1,3})/g;
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };

/** Decodifica uma string literal de PDF: (texto com \( escapes \)). */
function pdfString(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const next = src[i + 1];
    if (next in ESCAPES) {
      out += ESCAPES[next];
      i++;
    } else if (next >= '0' && next <= '7') {
      const m = src.slice(i + 1).match(/^[0-7]{1,3}/)!;
      out += String.fromCharCode(parseInt(m[0], 8));
      i += m[0].length;
    } else if (next === '\n') {
      i++;
    } else {
      out += next ?? '';
      i++;
    }
  }
  return out.replace(OCTAL, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
}

function hexString(src: string): string {
  const hex = src.replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

interface Piece {
  x: number;
  y: number;
  text: string;
}

/**
 * Percorre o content stream juntando o texto com a posição onde foi desenhado.
 * Com fonte Identity-H, o texto vem como índices de glifo de 2 bytes: quem
 * traduz é o /ToUnicode da fonte ativa (operador Tf).
 */
function piecesFrom(content: string, fonts: Map<string, FontInfo>): Piece[] {
  const pieces: Piece[] = [];
  let x = 0;
  let y = 0;
  let leading = 12;
  const nums: number[] = [];
  let pending = '';
  let font: FontInfo | undefined;

  /** Traduz os bytes crus de uma string de texto conforme a fonte ativa. */
  const decode = (chunk: string): string => {
    if (!font?.twoByte) {
      if (!font?.toUnicode) return chunk;
      let out = '';
      for (let k = 0; k < chunk.length; k++) out += font.toUnicode.get(chunk.charCodeAt(k)) ?? chunk[k];
      return out;
    }
    let out = '';
    for (let k = 0; k + 1 < chunk.length; k += 2) {
      const code = (chunk.charCodeAt(k) << 8) | chunk.charCodeAt(k + 1);
      const mapped = font.toUnicode?.get(code);
      // Sem mapa, o índice de glifo não quer dizer nada: melhor não inventar letra.
      out += mapped ?? '';
    }
    return out;
  };

  const push = (text: string) => {
    if (text) pieces.push({ x, y, text });
  };

  for (let i = 0; i < content.length; i++) {
    const c = content[i];

    if (c === '(') {
      let depth = 1;
      let j = i + 1;
      let buf = '';
      while (j < content.length && depth > 0) {
        if (content[j] === '\\') {
          buf += content[j] + (content[j + 1] ?? '');
          j += 2;
          continue;
        }
        if (content[j] === '(') depth++;
        else if (content[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
        buf += content[j];
        j++;
      }
      pending += decode(pdfString(buf));
      i = j;
      continue;
    }

    if (c === '<' && content[i + 1] !== '<') {
      const close = content.indexOf('>', i);
      if (close > -1) {
        pending += decode(hexString(content.slice(i + 1, close)));
        i = close;
        continue;
      }
    }

    if (c === '-' || c === '.' || (c >= '0' && c <= '9')) {
      const m = content.slice(i).match(/^-?\d*\.?\d+/);
      if (m) {
        nums.push(parseFloat(m[0]));
        i += m[0].length - 1;
        continue;
      }
    }

    if (/[A-Za-z'"*]/.test(c)) {
      const m = content.slice(i).match(/^(T\*|Tj|TJ|Td|TD|Tm|TL|Tf|BT|ET|'|")/);
      if (m) {
        const op = m[0];
        if (op === 'Tj' || op === 'TJ') {
          push(pending);
          pending = '';
        } else if (op === "'" || op === '"') {
          y -= leading;
          push(pending);
          pending = '';
        } else if (op === 'Td' || op === 'TD') {
          const ty = nums.pop() ?? 0;
          const tx = nums.pop() ?? 0;
          x += tx;
          y += ty;
          if (op === 'TD') leading = -ty;
        } else if (op === 'Tm') {
          const f = nums.pop() ?? 0;
          const e = nums.pop() ?? 0;
          nums.length = 0;
          x = e;
          y = f;
        } else if (op === 'Tf') {
          const name = content.slice(Math.max(0, i - 40), i).match(/\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s*$/);
          if (name) font = fonts.get(name[1]);
        } else if (op === 'TL') {
          leading = nums.pop() ?? leading;
        } else if (op === 'T*') {
          y -= leading;
        } else if (op === 'BT') {
          x = 0;
          y = 0;
        }
        nums.length = 0;
        i += op.length - 1;
        continue;
      }
      // qualquer outro operador: descarta os números acumulados
      const word = content.slice(i).match(/^[A-Za-z*'"]+/);
      if (word) {
        nums.length = 0;
        i += word[0].length - 1;
      }
    }
  }
  push(pending);
  return pieces;
}

export interface Cell {
  x: number;
  text: string;
}

export interface Row {
  y: number;
  cells: Cell[];
  /** A linha inteira, já com as células na ordem da esquerda para a direita. */
  text: string;
}

/** Junta os pedaços em linhas, de cima para baixo, preservando a posição de cada célula. */
function rowsFrom(pieces: Piece[]): Row[] {
  const byY = new Map<number, Piece[]>();
  for (const p of pieces) {
    // Agrupa por altura com tolerância: a mesma linha costuma variar frações de ponto.
    const key = Math.round(p.y / 3);
    const list = byY.get(key) ?? [];
    list.push(p);
    byY.set(key, list);
  }
  return [...byY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, list]) => {
      const cells = list
        .sort((a, b) => a.x - b.x)
        .map((p) => ({ x: p.x, text: p.text.replace(/\s+/g, ' ').trim() }))
        .filter((c) => c.text);
      return { y: key * 3, cells, text: cells.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim() };
    })
    .filter((r) => r.text);
}

/** Linhas de cada página, com posição. Páginas separadas porque o Y reinicia em cada uma. */
export function extractPdfPages(bytes: Uint8Array): Row[][] {
  return pagesOf(bytes).map((p) => rowsFrom(piecesFrom(p.content, p.fonts)));
}

/** Linhas de texto de um PDF, na ordem em que aparecem na página. */
export function extractPdfLines(bytes: Uint8Array): string[] {
  return extractPdfPages(bytes).flatMap((page) => page.map((r) => r.text));
}

/** PDF protegido por senha: os streams vêm cifrados e não há texto a extrair. */
export function isEncrypted(bytes: Uint8Array): boolean {
  const tail = latin1(bytes, Math.max(0, bytes.length - 4000));
  return /\/Encrypt\s/.test(tail) || /\/Encrypt\s/.test(latin1(bytes, 0, Math.min(bytes.length, 4000)));
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

export { encoder as __encodeLatin1 };

// ---------------------------------------------------------------- extrato

import { normalize } from '../categorizer';
import { parseDateToISO } from '../dates';
import { parseMoneyToCents } from '../money';
import type { ParsedRow, ParseResult } from './types';

/*
 * Cada banco monta o extrato de um jeito. O que varia, e como tratamos:
 *  - data: 10/10/2026, 10/10/26, 10/10, "10 OUT", "10 OUT 2026", "10 de outubro"
 *  - data só no cabeçalho do dia (Nubank), com os lançamentos abaixo sem data
 *  - sinal: "-", parênteses, sufixo D/C (Banco do Brasil), ou colunas separadas
 *    de Crédito e Débito (Bradesco) — aí quem decide é a posição na página
 *  - coluna de saldo no fim da linha, que não é lançamento
 */

const MONEY_G = /(?:^|[\s])(-?\(?(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\)?)/g;
const MONEY_ONE = /^-?\(?(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\)?$/;

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/*
 * Quando o PDF não traz sinal nem marca C/D, a descrição é o que sobra para
 * decidir o sentido. "Transferência recebida" e "Salário" são entradas;
 * tratá-las como gasto estragaria todo o resumo do mês.
 */
const INCOME_HINT =
  /\brecebid[ao]\b|\bcredito\b|\bdeposito\b|\bsalario\b|\bprovento\b|\brendimento\b|\bestorno\b|\breembolso\b|\bdevolucao\b|\brestituicao\b|\bresgate\b|\bentrada\b|\bted recebid|\bdoc recebid|pagamento recebido|\bcashback\b|\bvenda\b|\btransferencia recebida\b/;

/*
 * Alguns extratos agrupam o dia em duas seções, "Total de entradas" e
 * "Total de saídas", e os lançamentos vêm sem sinal embaixo de cada uma.
 * A seção é o sinal mais confiável nesse formato (é o do Nubank).
 */
/** Linha de intervalo ("01/11/2026 a 11/11/2026"): é período, não dia de lançamento. */
const DATE_RANGE = /\d{1,2}[^\n]{0,24}\b(a|at[eé])\b[^\n]{0,24}\d{1,2}/i;

const FLOW_IN = /total de entradas|total de cr[eé]ditos/i;
const FLOW_OUT = /total de sa[ií]das|total de d[eé]bitos/i;

/** Documento mascarado no meio da descrição: "•••.871.467-••". */
const MASKED_DOC = /[•*·]{2,}[.\s]?(?:\d{3}[.\s]?){0,2}\d{0,3}[-\s]?[•*·]*/g;

/** Colunas que são número de documento, não valor. */
const DOC_HEADER = /^(docto|documento|doc|n[o°.]? ?doc|numero)/i;

const SKIP_LINE =
  /saldo|total\b|limite|vencimento|fatura anterior|p[aá]gina|extrato de|per[ií]odo|ag[eê]ncia|c\.?n\.?p\.?j|c\.?p\.?f|demonstrativo|subtotal|encerramento|saldo dispon/i;

const DATE_HEAD =
  /^(\d{1,2})\s*(?:[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?|\s+de\s+([a-zç]{3,9})(?:\s+de\s+(\d{4}))?|\s+([a-zç]{3,9})\.?(?:\s+(\d{4}))?)/i;

interface FoundDate {
  iso: string;
  /** Quantos caracteres da linha a data ocupou. */
  length: number;
}

/** Lê a data no começo da linha, em qualquer um dos formatos usados pelos bancos. */
function readDate(text: string, year: number): FoundDate | null {
  const m = text.match(DATE_HEAD);
  if (!m) return null;
  const day = Number(m[1]);
  let month: number | undefined;
  let y = year;

  if (m[2]) {
    month = Number(m[2]);
    if (m[3]) y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  } else {
    const name = (m[4] ?? m[6] ?? '').toLowerCase().slice(0, 3);
    month = MESES[name];
    const explicit = m[5] ?? m[7];
    if (explicit) y = Number(explicit);
  }
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = parseDateToISO(`${day}/${month}/${y}`);
  return iso ? { iso, length: m[0].length } : null;
}

/** Ano predominante no documento, para as linhas que só trazem dia e mês. */
function guessYear(lines: string[]): number {
  const count = new Map<number, number>();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(20\d{2})\b/g)) {
      const y = Number(m[1]);
      count.set(y, (count.get(y) ?? 0) + 1);
    }
  }
  let best = new Date().getFullYear();
  let max = 0;
  for (const [y, n] of count) {
    if (n > max) {
      max = n;
      best = y;
    }
  }
  return best;
}

interface Columns {
  credit?: number;
  debit?: number;
  /** Coluna de número de documento, que não deve virar descrição. */
  doc?: number;
}

/** Procura um cabeçalho com colunas separadas de crédito e débito (Bradesco e afins). */
function findColumns(page: Row[]): Columns {
  for (const row of page) {
    const hasCredit = row.cells.find((c) => /cr[eé]dito|entrada/i.test(c.text));
    const hasDebit = row.cells.find((c) => /d[eé]bito|sa[ií]da/i.test(c.text));
    const doc = row.cells.find((c) => DOC_HEADER.test(c.text))?.x;
    if (hasCredit && hasDebit && hasCredit.x !== hasDebit.x) {
      return { credit: hasCredit.x, debit: hasDebit.x, doc };
    }
    if (doc !== undefined) return { doc };
  }
  return {};
}

const near = (a: number, b: number) => Math.abs(a - b) < 60;

export function parsePdfPages(pages: Row[][]): ParseResult {
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const allText = pages.flatMap((p) => p.map((r) => r.text));
  const year = guessYear(allText);
  let skipped = 0;
  let ambiguous = 0;
  let usedColumns = false;
  let hadBalance = false;

  // A data atravessa a página: um lançamento pode cair no topo da seguinte,
  // antes de qualquer cabeçalho de dia.
  let currentDate: string | null = null;

  for (const page of pages) {
    const cols = findColumns(page);

    let flow: 'in' | 'out' | null = null;

    for (const row of page) {
      const text = row.text;
      const found = readDate(text, year);
      const money = [...text.matchAll(MONEY_G)];

      // A data vale para as linhas seguintes, mesmo quando a linha dela é um
      // cabeçalho com subtotal ("01 NOV 2026 Total de entradas + 100,00").
      if (found && !(DATE_RANGE.test(text) && !money.length)) currentDate = found.iso;
      if (FLOW_IN.test(text)) flow = 'in';
      else if (FLOW_OUT.test(text)) flow = 'out';

      if (!money.length) continue;
      if (SKIP_LINE.test(text)) continue;

      const date = found?.iso ?? currentDate;
      if (!date) {
        skipped++;
        continue;
      }

      let signed: number | null = null;
      let valueAt = -1;
      let valueLen = 0;

      // 1) Colunas separadas de crédito e débito: a posição decide o sinal.
      if (cols.credit !== undefined && cols.debit !== undefined) {
        for (const cell of row.cells) {
          if (!MONEY_ONE.test(cell.text)) continue;
          const cents = parseMoneyToCents(cell.text);
          if (cents === null || cents === 0) continue;
          if (near(cell.x, cols.credit)) {
            signed = Math.abs(cents);
          } else if (near(cell.x, cols.debit)) {
            signed = -Math.abs(cents);
          } else {
            continue;
          }
          usedColumns = true;
          valueAt = text.indexOf(cell.text);
          valueLen = cell.text.length;
          break;
        }
      }

      // 2) Caso geral: primeiro valor da linha; o que vier depois é saldo.
      if (signed === null) {
        const first = money[0];
        const value = first[1];
        valueAt = (first.index ?? 0) + first[0].indexOf(value);
        valueLen = value.length;
        const cents = parseMoneyToCents(value);
        if (cents === null || cents === 0) {
          skipped++;
          continue;
        }
        if (money.length > 1) hadBalance = true;
        const after = text.slice(valueAt + valueLen).trim();
        const marker = after.match(/^([CD])\b/i)?.[1]?.toUpperCase();
        if (marker === 'C') signed = Math.abs(cents);
        else if (marker === 'D') signed = -Math.abs(cents);
        else if (cents < 0 || value.trim().startsWith('(')) signed = -Math.abs(cents);
        else if (flow === 'in') signed = Math.abs(cents);
        else if (flow === 'out') signed = -Math.abs(cents);
        else if (INCOME_HINT.test(normalize(text))) signed = Math.abs(cents);
        else {
          signed = -Math.abs(cents);
          ambiguous++;
        }
      }

      const start = found ? found.length : 0;
      let description = text
        .slice(start, valueAt > start ? valueAt : undefined)
        .replace(MASKED_DOC, ' ')
        .replace(/(\s*[-–—]\s*){2,}/g, ' - ')
        .replace(/\s+/g, ' ')
        .replace(/^[-–—:|]+\s*/, '')
        .replace(/[\s\-–—:|]+$/, '')
        .trim();
      // Tira o número do documento, que em alguns extratos fica entre a descrição e o valor.
      if (cols.doc !== undefined) {
        const docCell = row.cells.find((c) => near(c.x, cols.doc!) && /^\d[\d.-]*$/.test(c.text));
        if (docCell) description = description.replace(docCell.text, '').replace(/\s+/g, ' ').trim();
      }
      description = description.replace(/\s+\d{5,}$/, '').trim();

      // Linha sem texto nenhum antes do valor é resumo ou sobra de layout,
      // não lançamento (ex.: um "R$ 7,51" solto no topo do extrato).
      if (description.replace(/[^\p{L}]/gu, '').length < 3) {
        skipped++;
        continue;
      }

      rows.push({ date, description, amountCents: signed });
    }
  }

  if (!rows.length) {
    warnings.push(
      allText.length
        ? 'Li o texto do PDF, mas não reconheci linhas de lançamento (data, descrição e valor). Toque em "Ver o que foi lido" e me mostre essas linhas.'
        : 'Não há texto neste PDF — ele é digitalizado (uma imagem) ou está protegido por senha. Exporte o extrato em CSV ou OFX.',
    );
  } else {
    if (usedColumns) warnings.push('Usei as colunas de crédito e débito do extrato para definir entradas e saídas.');
    if (ambiguous) {
      warnings.push(
        `${ambiguous} lançamentos não traziam sinal nem marca C/D: entraram como saída. Toque na linha para corrigir.`,
      );
    }
    if (hadBalance) warnings.push('A linha tem mais de um valor (provável coluna de saldo); usei sempre o primeiro.');
    const transfers = rows.filter((r) => /transfer[eê]ncia|\bpix\b|\bted\b|\bdoc\b/i.test(r.description)).length;
    if (transfers >= 3) {
      warnings.push(
        `${transfers} lançamentos são transferências. As que forem entre as suas próprias contas não são receita nem gasto: toque nelas e escolha a categoria "Transferência / fatura" para ficarem fora das contas.`,
      );
    }
  }

  return { format: 'pdf', rows, skipped, warnings, looksLikeCardInvoice: false };
}

export function parsePdf(bytes: Uint8Array): ParseResult {
  if (isEncrypted(bytes)) {
    return {
      format: 'pdf',
      rows: [],
      skipped: 0,
      warnings: ['Este PDF está protegido por senha, então o texto não pode ser lido. Exporte o extrato em CSV ou OFX, ou salve o PDF sem senha.'],
      looksLikeCardInvoice: false,
    };
  }
  return parsePdfPages(extractPdfPages(bytes));
}

/** Linhas lidas do PDF, para mostrar na tela quando nada é reconhecido. */
export function pdfDiagnostic(bytes: Uint8Array): string[] {
  try {
    return extractPdfLines(bytes).slice(0, 40);
  } catch {
    return [];
  }
}
