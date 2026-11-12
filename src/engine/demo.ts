import { currentMonthKey, shiftMonth } from './dates';
import type { Settings, Transaction } from './types';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_SETTINGS: Settings = {
  monthlyIncomeCents: 650000,
  incomeSources: [{ id: 'demo-salario', label: 'Salário', cents: 650000 }],
  mealBenefitCents: 80000,
  aliases: { 'conta de luz enel': 'Luz', 'smart fit academia': 'Academia', 'posto shell combustivel': 'Gasolina' },
  categoryRules: {},
  emergencyBalanceCents: 900000,
  budgetOverrides: {},
  notifications: { weeklySummary: true, budgetAlerts: true, dailyReminder: false },
};

/** Gera 4 meses de dados fictícios (com alguns excessos de propósito) para conhecer o app. */
export function buildDemoTransactions(now: Date = new Date()): Omit<Transaction, 'id'>[] {
  const rand = mulberry32(42);
  const out: Omit<Transaction, 'id'>[] = [];
  const cur = currentMonthKey(now);
  const today = now.getDate();

  const add = (
    month: string,
    day: number,
    description: string,
    reais: number,
    type: 'income' | 'expense',
    categoryId: string,
    recurring = false,
  ) => {
    if (month === cur && day > today) return;
    const date = `${month}-${String(Math.min(day, 28)).padStart(2, '0')}`;
    out.push({ date, description, amountCents: Math.round(reais * 100), type, categoryId, source: 'manual', externalId: null, recurring });
  };
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  for (let i = 3; i >= 0; i--) {
    const m = shiftMonth(cur, -i);
    add(m, 5, 'Salário', 6500, 'income', 'salario');
    if (i === 2) add(m, 18, 'Freela design', 800, 'income', 'renda_extra');

    add(m, 10, 'Aluguel', 1650, 'expense', 'moradia', true);
    add(m, 10, 'Condomínio', 360, 'expense', 'moradia', true);
    add(m, 12, 'Conta de luz Enel', between(150, 210), 'expense', 'contas');
    add(m, 15, 'Internet fibra', 119.9, 'expense', 'contas', true);
    add(m, 15, 'Celular Vivo', 59.9, 'expense', 'contas', true);

    [3, 10, 17, 24].forEach((d) => add(m, d, 'Supermercado Carrefour', between(210, 320), 'expense', 'mercado'));
    [6, 13, 20, 27].forEach((d) => add(m, d, 'Posto Shell combustível', between(120, 170), 'expense', 'transporte'));
    add(m, 8, 'Uber', between(25, 60), 'expense', 'transporte');
    add(m, 22, 'Uber', between(25, 60), 'expense', 'transporte');
    add(m, 9, 'Drogasil', between(60, 110), 'expense', 'saude');
    add(m, 5, 'Smart Fit academia', 109.9, 'expense', 'saude', true);
    add(m, 14, 'Curso Alura', 89, 'expense', 'educacao');
    add(m, 20, 'Parcela notebook', 340, 'expense', 'dividas', true);
    add(m, 8, 'Financiamento da moto Banco Honda', 691.93, 'expense', 'veiculo', true);

    const deliveryCount = 8 + Math.floor(rand() * 3);
    for (let k = 0; k < deliveryCount; k++) add(m, 2 + k * 3, k % 3 === 0 ? 'iFood' : k % 3 === 1 ? 'Restaurante Madero' : 'Rappi', between(52, 82), 'expense', 'delivery');

    add(m, 12, 'Cinema Cinemark ingresso', between(50, 80), 'expense', 'lazer');
    add(m, 21, 'Sympla show', between(120, 200), 'expense', 'lazer');
    add(m, 16, 'Shopee', between(120, 260), 'expense', 'compras');
    add(m, 25, 'Amazon compra', between(150, 340), 'expense', 'compras');
    add(m, 11, 'Salão beleza', between(70, 120), 'expense', 'cuidados');

    add(m, 7, 'Netflix', 55.9, 'expense', 'assinaturas', true);
    add(m, 7, 'Spotify', 21.9, 'expense', 'assinaturas', true);
    add(m, 9, 'Amazon Prime', 19.9, 'expense', 'assinaturas', true);
    add(m, 12, 'HBO Max', 34.9, 'expense', 'assinaturas', true);
    add(m, 13, 'Disney+', 43.9, 'expense', 'assinaturas', true);

    add(m, 6, 'Aplicação CDB', 300, 'expense', 'investimentos');
    add(m, 26, 'Anuidade cartão', 39.9, 'expense', 'outros');
    if (i <= 1) add(m, 19, 'Juros rotativo cartão', 47.3, 'expense', 'dividas');
  }
  return out;
}
