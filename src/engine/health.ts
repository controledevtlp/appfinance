import type { EmergencyStatus } from './budget';
import type { MonthSummary } from './types';

export interface HealthPart {
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface HealthScore {
  score: number; // 0..100
  label: 'Crítica' | 'Frágil' | 'Em evolução' | 'Boa' | 'Excelente';
  parts: HealthPart[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Nota de saúde financeira (0–100), 100% explicável:
 *  - 40 pts  taxa de poupança (20% ou mais = nota máxima)
 *  - 20 pts  comprometimento com dívidas (até 10% = máximo, 35% ou mais = zero)
 *  - 25 pts  categorias dentro do limite ideal
 *  - 15 pts  reserva de emergência (6 meses = máximo)
 * Retorna null quando ainda não há dados suficientes.
 */
export function healthScore(summary: MonthSummary, emergency: EmergencyStatus): HealthScore | null {
  if (summary.baseIncomeCents <= 0) return null;
  if (summary.expenseCents === 0 && summary.investedCents === 0) return null;

  const savings = clamp(summary.savingsRatePct / 20, 0, 1) * 40;
  const debt = (1 - clamp((summary.debtRatioPct - 10) / 25, 0, 1)) * 20;

  const active = summary.categories.filter((c) => c.spentCents > 0 && c.category.group !== 'poupanca');
  const within = active.filter((c) => c.status !== 'over').length;
  const budget = active.length ? (within / active.length) * 25 : 12.5;

  const reserve = clamp(emergency.monthsCovered / 6, 0, 1) * 15;

  const score = Math.round(savings + debt + budget + reserve);
  const label: HealthScore['label'] =
    score >= 85 ? 'Excelente' : score >= 70 ? 'Boa' : score >= 50 ? 'Em evolução' : score >= 30 ? 'Frágil' : 'Crítica';

  return {
    score,
    label,
    parts: [
      { label: 'Taxa de poupança', points: Math.round(savings), max: 40, detail: `${summary.savingsRatePct.toFixed(0)}% da renda (meta: 20%)` },
      { label: 'Dívidas', points: Math.round(debt), max: 20, detail: `${summary.debtRatioPct.toFixed(0)}% da renda (ideal: até 10%)` },
      { label: 'Categorias no limite', points: Math.round(budget), max: 25, detail: active.length ? `${within} de ${active.length} dentro do ideal` : 'sem gastos ainda' },
      { label: 'Reserva de emergência', points: Math.round(reserve), max: 15, detail: `${emergency.monthsCovered.toFixed(1).replace('.', ',')} de 6 meses` },
    ],
  };
}
