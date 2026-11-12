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

/** Conteúdo de todos os streams de texto do PDF, já descomprimidos. */
function contentStreams(bytes: Uint8Array): string[] {
  const raw = latin1(bytes);
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const open = raw.indexOf('stream', at);
    if (open === -1) break;
    // "endstream"/"endobj" contêm "stream" como sufixo; só vale a palavra isolada.
    const before = raw[open - 1];
    if (before !== '>' && before !== '\n' && before !== '\r' && before !== ' ' && before !== '\t') {
      at = open + 6;
      continue;
    }
    const close = raw.indexOf('endstream', open);
    if (close === -1) break;

    const dict = raw.slice(Math.max(0, open - 600), open);
    let start = open + 'stream'.length;
    if (raw[start] === '\r') start++;
    if (raw[start] === '\n') start++;
    let end = close;
    if (raw[end - 1] === '\n') end--;
    if (raw[end - 1] === '\r') end--;
    at = close + 9;

    // Imagens e fontes embutidas não têm texto para extrair.
    if (/\/Subtype\s*\/Image|\/FontFile|\/XObject\s*\/Image/.test(dict)) continue;

    if (/\/FlateDecode/.test(dict)) {
      try {
        out.push(latin1(unzlibSync(bytes.subarray(start, end))));
      } catch {
        // stream corrompido ou com filtro em cadeia: ignora
      }
    } else if (!/\/Filter/.test(dict)) {
      out.push(raw.slice(start, end));
    }
  }
  return out;
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

/** Percorre o content stream juntando o texto com a posição onde foi desenhado. */
function piecesFrom(content: string): Piece[] {
  const pieces: Piece[] = [];
  let x = 0;
  let y = 0;
  let leading = 12;
  const nums: number[] = [];
  let pending = '';

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
      pending += pdfString(buf);
      i = j;
      continue;
    }

    if (c === '<' && content[i + 1] !== '<') {
      const close = content.indexOf('>', i);
      if (close > -1) {
        pending += hexString(content.slice(i + 1, close));
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
      const m = content.slice(i).match(/^(T\*|Tj|TJ|Td|TD|Tm|TL|BT|ET|'|")/);
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
  return contentStreams(bytes).map((s) => rowsFrom(piecesFrom(s)));
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

  for (const page of pages) {
    const cols = findColumns(page);
    let currentDate: string | null = null;

    for (const row of page) {
      const text = row.text;
      const found = readDate(text, year);
      const money = [...text.matchAll(MONEY_G)];

      // Cabeçalho de dia ("10 DE OUTUBRO"): guarda a data para as linhas de baixo.
      if (found && !money.length) {
        currentDate = found.iso;
        continue;
      }
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
        else if (INCOME_HINT.test(normalize(text))) signed = Math.abs(cents);
        else {
          signed = -Math.abs(cents);
          ambiguous++;
        }
      }

      const start = found ? found.length : 0;
      let description = text
        .slice(start, valueAt > start ? valueAt : undefined)
        .replace(/\s+/g, ' ')
        .replace(/^[-–—:|]+\s*/, '')
        .trim();
      // Tira o número do documento, que em alguns extratos fica entre a descrição e o valor.
      if (cols.doc !== undefined) {
        const docCell = row.cells.find((c) => near(c.x, cols.doc!) && /^\d[\d.-]*$/.test(c.text));
        if (docCell) description = description.replace(docCell.text, '').replace(/\s+/g, ' ').trim();
      }
      description = description.replace(/\s+\d{5,}$/, '').trim();

      rows.push({ date, description: description || 'Sem descrição', amountCents: signed });
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
