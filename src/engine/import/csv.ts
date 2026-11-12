import { parseDateToISO } from '../dates';
import { normalize } from '../categorizer';
import { parseMoneyToCents } from '../money';
import type { ParseOptions, ParsedRow, ParseResult } from './types';

/** Divide texto CSV em linhas/células respeitando aspas. */
export function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15).join('\n');
  const counts = [';', ',', '\t'].map((d) => ({ d, n: sample.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ';';
}

const DATE_HDR = /^(data|date|dt)\b|^data (do |da )?(lancamento|movimentacao|transacao|compra)|^dt\.? ?(lancamento|transacao)/;
const AMOUNT_HDR = /^(valor|amount|value|quantia|montante)\b/;
const DEBIT_HDR = /^(debito|saida|debit|valor debito)/;
const CREDIT_HDR = /^(credito|entrada|credit|valor credito)/;
const DESC_HDR = /(descricao|historico|lancamento|description|title|titulo|estabelecimento|memo|detalhe|favorecido|nome)/;
const ID_HDR = /^(identificador|id|fitid|codigo|documento)$/;
const IGNORE_DESC = /^saldo (anterior|do dia|final|parcial|inicial)|^total\b/;
/** Palavras que só dizem o tipo do lançamento e poluem a descrição. */
const GENERIC_DESC = /^(d[eé]bito|cr[eé]dito|compra|compra no d[eé]bito|compra com cart[aã]o|compra cart[aã]o|lan[cç]amento|movimenta[cç][aã]o|hist[oó]rico)$/i;

interface Columns {
  date: number;
  amount: number;
  debit: number;
  credit: number;
  desc: number[];
  id: number;
}

function findHeader(rows: string[][]): { index: number; cols: Columns } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(normalize);
    const date = h.findIndex((c) => DATE_HDR.test(c));
    if (date === -1) continue;
    const amount = h.findIndex((c, idx) => idx !== date && AMOUNT_HDR.test(c));
    const debit = h.findIndex((c) => DEBIT_HDR.test(c));
    const credit = h.findIndex((c) => CREDIT_HDR.test(c));
    if (amount === -1 && debit === -1 && credit === -1) continue;
    const desc = h
      .map((c, idx) => ({ c, idx }))
      .filter(({ c, idx }) => idx !== date && idx !== amount && idx !== debit && idx !== credit && DESC_HDR.test(c))
      .map(({ idx }) => idx)
      .slice(0, 2);
    const id = h.findIndex((c, idx) => idx !== date && ID_HDR.test(c));
    return { index: i, cols: { date, amount, debit, credit, desc, id } };
  }
  return null;
}

/** Sem cabeçalho: descobre colunas pelo conteúdo. */
function inferColumns(rows: string[][]): Columns | null {
  const sample = rows.slice(0, 30);
  const width = Math.max(...sample.map((r) => r.length));
  let date = -1;
  let amount = -1;
  for (let c = 0; c < width; c++) {
    const vals = sample.map((r) => r[c] ?? '').filter(Boolean);
    if (!vals.length) continue;
    const dates = vals.filter((v) => parseDateToISO(v)).length;
    const money = vals.filter((v) => /^[-+(]?\s*(R\$)?\s*\d[\d.,]*\)?$/.test(v) && parseMoneyToCents(v) !== null).length;
    if (date === -1 && dates / vals.length > 0.7) date = c;
    else if (money / vals.length > 0.7 && !(dates / vals.length > 0.7)) amount = c; // última coluna numérica vence
  }
  if (date === -1 || amount === -1) return null;
  let desc = -1;
  let best = 0;
  for (let c = 0; c < width; c++) {
    if (c === date || c === amount) continue;
    const avg = sample.reduce((a, r) => a + (r[c]?.length ?? 0), 0) / sample.length;
    if (avg > best) {
      best = avg;
      desc = c;
    }
  }
  return { date, amount, debit: -1, credit: -1, desc: desc === -1 ? [] : [desc], id: -1 };
}

export function parseCsv(text: string, options: ParseOptions = {}): ParseResult {
  const warnings: string[] = [];
  const delimiter = detectDelimiter(text);
  const all = splitCsv(text, delimiter);

  let cols: Columns | null = null;
  let start = 0;
  const header = findHeader(all);
  let headerNorm: string[] = [];
  if (header) {
    cols = header.cols;
    start = header.index + 1;
    headerNorm = all[header.index].map(normalize);
  } else {
    cols = inferColumns(all);
    if (cols) warnings.push('Não achei o cabeçalho, então deduzi as colunas pelo conteúdo. Confere a prévia com carinho.');
  }
  if (!cols) {
    return { format: 'csv', rows: [], skipped: 0, warnings: ['Não consegui achar as colunas de data e valor nesse arquivo.'], looksLikeCardInvoice: false };
  }

  // Fatura do Nubank (date,category,title,amount): compras vêm positivas.
  const looksLikeCardInvoice = headerNorm.includes('title') && headerNorm.includes('category');
  const positiveIsExpense = options.positiveIsExpense ?? looksLikeCardInvoice;

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const r of all.slice(start)) {
    const date = parseDateToISO(r[cols.date] ?? '');
    let cents: number | null = null;
    if (cols.amount !== -1) cents = parseMoneyToCents(r[cols.amount] ?? '');
    else {
      const d = parseMoneyToCents(r[cols.debit] ?? '') ?? 0;
      const c = parseMoneyToCents(r[cols.credit] ?? '') ?? 0;
      cents = c !== 0 || d !== 0 ? Math.abs(c) - Math.abs(d) : null;
    }
    const parts = cols.desc.map((i) => (r[i] ?? '').trim()).filter((v, idx, arr) => v && arr.indexOf(v) === idx);
    // "Débito" sozinho não diz nada; só vale a pena quando é a única informação da linha.
    const useful = parts.filter((v) => !GENERIC_DESC.test(v));
    const description = (useful.length ? useful : parts).join(' - ');
    if (!date || cents === null || cents === 0) {
      // Linhas de saldo/total sem data não contam como erro.
      if (r.some((c) => c) && !IGNORE_DESC.test(normalize(description))) skipped++;
      continue;
    }
    if (IGNORE_DESC.test(normalize(description))) continue;
    rows.push({
      date,
      description: description || 'Sem descrição',
      amountCents: positiveIsExpense ? -cents : cents,
      bankId: cols.id !== -1 && r[cols.id] ? r[cols.id] : undefined,
    });
  }
  if (!rows.length) warnings.push('Não achei nenhum lançamento válido aqui dentro.');
  return { format: 'csv', rows, skipped, warnings, looksLikeCardInvoice };
}
