export interface ParsedRow {
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** Com sinal: negativo = saída, positivo = entrada (já considerando a opção de fatura). */
  amountCents: number;
  /** Identificador do banco quando existir (FITID, identificador do Nubank...). */
  bankId?: string;
}

export interface ParseResult {
  format: 'csv' | 'ofx' | 'pdf';
  rows: ParsedRow[];
  /** Linhas ignoradas por data/valor inválidos. */
  skipped: number;
  warnings: string[];
  /** O arquivo parece ser fatura de cartão (valores positivos são compras). */
  looksLikeCardInvoice: boolean;
}

export interface ParseOptions {
  /** Força a interpretação "positivo = gasto" (faturas de cartão). */
  positiveIsExpense?: boolean;
}
