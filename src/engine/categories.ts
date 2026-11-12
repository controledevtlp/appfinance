import type { Category } from './types';

/**
 * Regra 50/30/20 adaptada ao Brasil. Os percentuais são sobre a renda líquida.
 *  - Necessidades: 50%  (soma dos idealPct abaixo)
 *  - Desejos:      30%
 *  - Poupança:     20%
 */
export const CATEGORIES: Category[] = [
  // ---- Necessidades (50%) ----
  { id: 'moradia', name: 'Moradia', group: 'necessidades', icon: 'home', idealPct: 20 },
  { id: 'contas', name: 'Contas (luz, água, internet)', group: 'necessidades', icon: 'flash', idealPct: 5 },
  { id: 'mercado', name: 'Mercado', group: 'necessidades', icon: 'cart', idealPct: 10 },
  { id: 'transporte', name: 'Transporte', group: 'necessidades', icon: 'bus', idealPct: 6 },
  { id: 'saude', name: 'Saúde', group: 'necessidades', icon: 'medkit', idealPct: 3 },
  { id: 'educacao', name: 'Educação', group: 'necessidades', icon: 'school', idealPct: 2 },
  { id: 'dividas', name: 'Dívidas e parcelas', group: 'necessidades', icon: 'card', idealPct: 4 },
  // ---- Desejos (30%) ----
  { id: 'delivery', name: 'Restaurantes e delivery', group: 'desejos', icon: 'fast-food', idealPct: 7 },
  { id: 'lazer', name: 'Lazer e viagens', group: 'desejos', icon: 'game-controller', idealPct: 6 },
  { id: 'compras', name: 'Compras', group: 'desejos', icon: 'bag-handle', idealPct: 6 },
  { id: 'assinaturas', name: 'Assinaturas e streaming', group: 'desejos', icon: 'tv', idealPct: 3 },
  { id: 'cuidados', name: 'Cuidados pessoais', group: 'desejos', icon: 'cut', idealPct: 3 },
  { id: 'outros', name: 'Outros', group: 'desejos', icon: 'ellipsis-horizontal-circle', idealPct: 5 },
  // ---- Poupança (20%) ----
  { id: 'investimentos', name: 'Investimentos e reserva', group: 'poupanca', icon: 'trending-up', idealPct: 20 },
  // ---- Receitas ----
  { id: 'salario', name: 'Salário', group: 'renda', icon: 'cash', idealPct: 0 },
  { id: 'renda_extra', name: 'Renda extra', group: 'renda', icon: 'add-circle', idealPct: 0 },
  { id: 'outras_receitas', name: 'Outras receitas', group: 'renda', icon: 'gift', idealPct: 0 },
  // ---- Não contam nos cálculos ----
  { id: 'transferencia', name: 'Transferência / fatura', group: 'ignorar', icon: 'swap-horizontal', idealPct: 0 },
];

export const GROUP_LABEL = {
  necessidades: 'Necessidades',
  desejos: 'Desejos',
  poupanca: 'Poupança',
  renda: 'Receitas',
  ignorar: 'Ignorados',
} as const;

/**
 * Compromissos fixos: não dá para cortar de um mês para o outro (dependem de
 * contrato, renegociação ou mudança de plano). O plano de melhoria dessas
 * categorias é renegociar, não "cortar um terço por mês".
 */
export const FIXED_COST_CATEGORIES = new Set(['moradia', 'contas', 'saude', 'educacao', 'dividas']);

/** Onde o cartão alimentação pode ser usado: mercado e alimentação fora de casa. */
export const FOOD_CATEGORIES = ['mercado', 'delivery'] as const;

export const GROUP_IDEAL_PCT = { necessidades: 50, desejos: 30, poupanca: 20 } as const;

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return BY_ID.get(id) ?? BY_ID.get('outros')!;
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.group !== 'renda');
export const INCOME_CATEGORIES = CATEGORIES.filter((c) => c.group === 'renda');
