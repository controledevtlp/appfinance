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

/** Junta os pedaços em linhas de texto, de cima para baixo. */
function linesFrom(pieces: Piece[]): string[] {
  const rows = new Map<number, Piece[]>();
  for (const p of pieces) {
    // Agrupa por altura com tolerância: a mesma linha costuma variar frações de ponto.
    const key = Math.round(p.y / 3);
    const list = rows.get(key) ?? [];
    list.push(p);
    rows.set(key, list);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, list]) =>
      list
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

/** Linhas de texto de um PDF, na ordem em que aparecem na página. */
export function extractPdfLines(bytes: Uint8Array): string[] {
  const streams = contentStreams(bytes);
  const lines: string[] = [];
  for (const s of streams) lines.push(...linesFrom(piecesFrom(s)));
  return lines;
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

export { encoder as __encodeLatin1 };

// ---------------------------------------------------------------- extrato

import { parseDateToISO } from '../dates';
import { parseMoneyToCents } from '../money';
import type { ParsedRow, ParseResult } from './types';

/*
 * Valor monetário. O "R$" só conta junto ("R" sozinho comeria o R final de
 * CARREFOUR), e exigimos espaço ou início de linha antes, para não pegar
 * pedaço de código. O grupo 1 é o valor; o índice dele dá onde a descrição acaba.
 */
const MONEY = /(?:^|[\s])(-?\(?(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\)?)/g;
const DATE_AT_START = /^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s+/;
const SKIP_LINE = /saldo|total\b|limite|vencimento|fatura anterior|pagina|p[aá]gina|extrato de|per[ií]odo|ag[eê]ncia|conta corrente|cnpj|cpf|demonstrativo|lan[cç]amentos do dia/i;

/** Ano predominante no documento, para linhas que só trazem dia/mês. */
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

/**
 * Lê as linhas de texto de um extrato em PDF.
 * Procura "data ... descrição ... valor". Quando a linha traz dois valores
 * (padrão Data | Histórico | Valor | Saldo), o segundo é o saldo e é ignorado.
 */
export function parsePdfLines(lines: string[]): ParseResult {
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const year = guessYear(lines);
  let skipped = 0;
  let ambiguous = 0;
  let hadBalanceColumn = false;

  for (const line of lines) {
    const dateMatch = line.match(DATE_AT_START);
    if (!dateMatch) continue;
    if (SKIP_LINE.test(line)) continue;

    const matches = [...line.matchAll(MONEY)];
    if (!matches.length) continue;

    const first = matches[0];
    const firstValue = first[1];
    const valueAt = (first.index ?? 0) + first[0].indexOf(firstValue);
    if (matches.length > 1) hadBalanceColumn = true;

    let dateText = dateMatch[1];
    if (!/[/.-]\d{2,4}$/.test(dateText) || dateText.split(/[/.-]/).length === 2) dateText = `${dateText}/${year}`;
    const date = parseDateToISO(dateText);

    const description = line.slice(dateMatch[0].length, valueAt).replace(/\s+/g, ' ').trim();
    const cents = parseMoneyToCents(firstValue);
    if (!date || cents === null || cents === 0) {
      skipped++;
      continue;
    }

    // Sinal: "-" e parênteses são saída; "D"/"C" logo após o valor são débito/crédito.
    const after = line.slice(valueAt + firstValue.length).trim();
    const marker = after.match(/^([CD])\b/i)?.[1]?.toUpperCase();
    let signed: number;
    if (marker === 'C') signed = Math.abs(cents);
    else if (marker === 'D') signed = -Math.abs(cents);
    else if (cents < 0 || firstValue.trim().startsWith('(')) signed = -Math.abs(cents);
    else {
      signed = -Math.abs(cents);
      ambiguous++;
    }

    rows.push({ date, description: description || 'Sem descrição', amountCents: signed });
  }

  if (!rows.length) {
    warnings.push(
      lines.length
        ? 'Li o texto do PDF, mas não reconheci linhas de lançamento (data, descrição e valor). Se puder, exporte o extrato em CSV ou OFX.'
        : 'Não há texto neste PDF — ele provavelmente é digitalizado (uma imagem). Exporte o extrato em CSV ou OFX.',
    );
  } else {
    if (ambiguous) {
      warnings.push(
        `${ambiguous} lançamentos não traziam sinal nem marca C/D: entraram como saída. Confira na prévia e toque para corrigir.`,
      );
    }
    if (hadBalanceColumn) warnings.push('O PDF parece ter coluna de saldo; usei sempre o primeiro valor da linha.');
  }

  return { format: 'pdf', rows, skipped, warnings, looksLikeCardInvoice: false };
}

export function parsePdf(bytes: Uint8Array): ParseResult {
  return parsePdfLines(extractPdfLines(bytes));
}
