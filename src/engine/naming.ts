import { groupingKey } from './categorizer';
import type { Settings, Transaction } from './types';

/*
 * Apelidos: o extrato do banco traz "ENEL DISTRIBUICAO SP 0001", que não diz
 * nada de relance. O apelido é guardado pela chave de agrupamento (sem números
 * nem pontuação), então vale para todos os lançamentos iguais, inclusive os
 * que ainda vão ser importados nos próximos meses.
 */

export function displayName(description: string, aliases: Settings['aliases']): string {
  return aliases[groupingKey(description)] ?? description;
}

export function nameOf(tx: Pick<Transaction, 'description'>, settings: Settings): string {
  return displayName(tx.description, settings.aliases);
}

/** Guarda a categoria escolhida à mão para este estabelecimento. */
export function withCategoryRule(
  rules: Settings['categoryRules'],
  description: string,
  categoryId: string,
): Settings['categoryRules'] {
  const key = groupingKey(description);
  if (!key) return rules;
  return { ...rules, [key]: categoryId };
}

export function withAlias(aliases: Settings['aliases'], description: string, name: string): Settings['aliases'] {
  const key = groupingKey(description);
  if (!key) return aliases;
  const next = { ...aliases };
  const clean = name.trim();
  if (!clean || clean === description.trim()) delete next[key];
  else next[key] = clean;
  return next;
}

/** Quantos lançamentos seriam renomeados junto (o apelido vale para todos iguais). */
export function countSameName(txs: Transaction[], description: string): number {
  const key = groupingKey(description);
  if (!key) return 0;
  return txs.filter((t) => groupingKey(t.description) === key).length;
}
