import { parseMoneyToCents } from '../money';
import type { ParsedRow, ParseResult } from './types';

function tag(block: string, name: string): string | undefined {
  // OFX 1.x (SGML) não fecha as tags: lê até quebra de linha ou próxima tag.
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : undefined;
}

export function parseOfx(text: string): ParseResult {
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  let skipped = 0;
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const dt = tag(block, 'DTPOSTED');
    const amt = tag(block, 'TRNAMT');
    const dateMatch = dt?.match(/^(\d{4})(\d{2})(\d{2})/);
    const cents = amt ? parseMoneyToCents(amt) : null;
    if (!dateMatch || cents === null || cents === 0) {
      skipped++;
      continue;
    }
    const name = tag(block, 'NAME');
    const memo = tag(block, 'MEMO');
    const description = [memo, name].filter((v, i, a) => v && a.indexOf(v) === i).join(' - ') || 'Sem descrição';
    rows.push({
      date: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      description,
      amountCents: cents,
      bankId: tag(block, 'FITID'),
    });
  }
  if (!blocks.length) warnings.push('Nenhuma transação (STMTTRN) encontrada no arquivo OFX.');
  return { format: 'ofx', rows, skipped, warnings, looksLikeCardInvoice: false };
}
