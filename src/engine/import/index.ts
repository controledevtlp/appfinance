import { categorize, groupingKey, normalize } from '../categorizer';
import type { Transaction } from '../types';
import { parseCsv } from './csv';
import { isPdf, parsePdf } from './pdf';
import { parseOfx } from './ofx';
import type { ParseOptions, ParseResult, ParsedRow } from './types';

export type { ParseOptions, ParseResult, ParsedRow } from './types';
export { groupRecurringCandidates, type RecurringGroup } from './recurring';
export { extractPdfLines, extractPdfPages, isEncrypted, isPdf, parsePdf, parsePdfPages, pdfDiagnostic } from './pdf';

export function parseStatement(text: string, opts: ParseOptions = {}): ParseResult {
  const isOfx = /<OFX>|OFXHEADER|<STMTTRN>/i.test(text);
  return isOfx ? parseOfx(text) : parseCsv(text, opts);
}

/** Ponto de entrada da importação: decide o formato pelos próprios bytes do arquivo. */
export function parseStatementBytes(bytes: Uint8Array, opts: ParseOptions = {}): ParseResult {
  if (isPdf(bytes)) return parsePdf(bytes);
  return parseStatement(decodeBytes(bytes), opts);
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface PreviewRow extends Omit<Transaction, 'id'> {
  duplicate: boolean;
}

/**
 * Converte linhas lidas em lançamentos prontos, categorizando automaticamente.
 * `externalId` é estável entre importações do mesmo arquivo, o que permite descartar duplicatas.
 */
export function toPreviewRows(
  rows: ParsedRow[],
  existingExternalIds: Set<string>,
  /** Categorias que o usuário já corrigiu antes, para não ter de corrigir de novo. */
  learned: Record<string, string> = {},
): PreviewRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    let externalId: string;
    if (r.bankId) externalId = `bank:${r.bankId}`;
    else {
      const base = `${r.date}|${r.amountCents}|${normalize(r.description)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      externalId = `h:${hash(base)}:${n}`;
    }
    const type = r.amountCents < 0 ? 'expense' : 'income';
    const remembered = learned[groupingKey(r.description)];
    return {
      date: r.date,
      description: r.description,
      amountCents: Math.abs(r.amountCents),
      type,
      categoryId: remembered ?? categorize(r.description, type),
      source: 'import' as const,
      externalId,
      duplicate: existingExternalIds.has(externalId),
    };
  });
}

function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    const need = b < 0x80 ? 0 : b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : -1;
    if (need < 0 || i + need >= bytes.length + (need === 0 ? 1 : 0)) {
      if (need !== 0) return false;
    }
    for (let k = 1; k <= need; k++) {
      if ((bytes[i + k] & 0xc0) !== 0x80) return false;
    }
    i += need + 1;
  }
  return true;
}

/** Decodifica bytes de arquivo: UTF-8 e, se inválido, Windows-1252/Latin-1 (comum em bancos brasileiros). */
export function decodeBytes(bytes: Uint8Array): string {
  if (isValidUtf8(bytes)) return new TextDecoder('utf-8').decode(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
