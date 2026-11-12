/** Formata centavos como "R$ 1.234,56" (sem depender de Intl, que varia entre plataformas). */
export function formatBRL(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const int = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = neg ? '-' : opts.sign && cents > 0 ? '+' : '';
  return `${sign}R$ ${int},${frac}`;
}

/**
 * Converte texto digitado/importado em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "-R$ 12,30", "(12,30)".
 * Retorna null se não for um número.
 */
export function parseMoneyToCents(input: string): number | null {
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-/.test(s)) negative = true;
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : null;
  let intPart = s;
  let fracPart = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const after = s.slice(idx + 1);
    // "1.234" (3 dígitos após o ponto, sem vírgula) é milhar, não decimal.
    const looksThousands = after.length === 3 && s.split(decimalSep).length - 1 === 1 && !s.includes(decimalSep === '.' ? ',' : '.');
    if (!looksThousands) {
      intPart = s.slice(0, idx);
      fracPart = after;
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  const cents = parseInt(intPart || '0', 10) * 100 + parseInt((fracPart + '00').slice(0, 2), 10);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}
