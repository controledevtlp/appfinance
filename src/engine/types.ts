export type TxType = 'income' | 'expense';

/** Grupos da regra 50/30/20 (+ "ignorar" para transferências que não contam). */
export type Group = 'necessidades' | 'desejos' | 'poupanca' | 'renda' | 'ignorar';

export interface Category {
  id: string;
  name: string;
  group: Group;
  icon: string; // nome do ícone Ionicons
  /** Percentual ideal da renda líquida mensal (0–100). */
  idealPct: number;
}

export interface Transaction {
  id: string;
  /** Data no formato YYYY-MM-DD. */
  date: string;
  description: string;
  /** Sempre positivo, em centavos. O sinal vem de `type`. */
  amountCents: number;
  type: TxType;
  categoryId: string;
  source: 'manual' | 'import';
  /** Identificador do banco (FITID) ou hash, para evitar duplicar importações. */
  externalId?: string | null;
  /** Gasto que se repete todo mês (aluguel, assinatura, parcela). Marcado na importação. */
  recurring?: boolean;
}

/** Uma fonte de renda informada à mão, na tela Minha renda. */
export interface IncomeSource {
  id: string;
  label: string;
  cents: number;
}

export interface NotificationPrefs {
  weeklySummary: boolean;
  budgetAlerts: boolean;
  dailyReminder: boolean;
}

export interface Settings {
  /** Renda líquida mensal declarada, em centavos. 0 = usar a renda lançada no mês. */
  monthlyIncomeCents: number;
  /** Detalhamento de onde vem a renda (só informativo: a soma vai em monthlyIncomeCents). */
  incomeSources: IncomeSource[];
  /**
   * Limite mensal do cartão alimentação/refeição da empresa, em centavos.
   * É dinheiro de uso restrito: não entra na renda livre (não dá para pagar
   * aluguel nem investir), mas aumenta o teto de mercado e alimentação fora.
   */
  mealBenefitCents: number;
  /** Quanto já existe guardado como reserva de emergência, em centavos. */
  emergencyBalanceCents: number;
  /** Limites personalizados por categoria (centavos/mês). */
  budgetOverrides: Record<string, number>;
  notifications: NotificationPrefs;
}

export const DEFAULT_SETTINGS: Settings = {
  monthlyIncomeCents: 0,
  incomeSources: [],
  mealBenefitCents: 0,
  emergencyBalanceCents: 0,
  budgetOverrides: {},
  notifications: { weeklySummary: true, budgetAlerts: true, dailyReminder: false },
};

export type LimitStatus = 'ok' | 'warning' | 'over';

export interface CategoryUsage {
  category: Category;
  spentCents: number;
  limitCents: number;
  /** spent / limit (0 se o limite for 0 e não houver gasto). */
  ratio: number;
  status: LimitStatus;
}

export interface GroupUsage {
  group: 'necessidades' | 'desejos' | 'poupanca';
  label: string;
  idealPct: number;
  idealCents: number;
  spentCents: number;
  /** % real sobre a renda base. */
  actualPct: number;
}

export interface MonthSummary {
  month: string; // YYYY-MM
  incomeCents: number; // receitas lançadas no mês
  baseIncomeCents: number; // base dos cálculos (declarada ou lançada)
  expenseCents: number; // despesas "reais" (exclui poupança e ignorar)
  investedCents: number; // aportes em poupança/investimentos
  balanceCents: number; // renda lançada - despesas - aportes
  /** Benefício alimentação do mês (uso restrito). */
  benefitCents: number;
  /** Renda livre + benefício: tudo o que entrou, para a conta de quanto sobrou. */
  totalResourcesCents: number;
  /** (recursos totais - gastos) / recursos totais, em % */
  savingsRatePct: number;
  debtCents: number;
  /** parcelas e dívidas / renda base, em % */
  debtRatioPct: number;
  groups: GroupUsage[];
  categories: CategoryUsage[];
  /** Estimativa de gasto no fim do mês (ritmo atual). Só no mês corrente. */
  projectedExpenseCents: number | null;
}

export type TipSeverity = 'alerta' | 'atencao' | 'info' | 'positivo';

export interface Tip {
  id: string;
  severity: TipSeverity;
  title: string;
  message: string;
  categoryId?: string;
  /** Economia mensal estimada se o plano for seguido, em centavos. */
  savingsCents: number;
  /** Plano de melhoria em etapas. */
  steps: string[];
}
