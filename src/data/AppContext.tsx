import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  computeMonthSummary,
  dailySpending,
  emergencyStatus,
  monthlySeries,
  recurringMonthlyCost,
  type DayPoint,
  type EmergencyStatus,
  type SeriesPoint,
} from '@/engine/budget';
import { currentMonthKey } from '@/engine/dates';
import { buildDemoTransactions, DEMO_SETTINGS } from '@/engine/demo';
import { healthScore, type HealthScore } from '@/engine/health';
import { generateTips } from '@/engine/tips';
import { DEFAULT_SETTINGS, type MonthSummary, type Settings, type Tip, type Transaction } from '@/engine/types';
import { notifyBudgetAlerts, syncRecurringNotifications } from '@/notifications';
import { LocalStore, SupabaseStore, type DataStore, type NewTransaction } from './store';
import { isCloudConfigured, supabase } from './supabase';

interface AppState {
  /** Primeira carga (sessão + dados) concluída. */
  ready: boolean;
  mode: 'local' | 'cloud';
  session: Session | null;
  error: string | null;
  transactions: Transaction[];
  settings: Settings;
  month: string;
  setMonth: (m: string) => void;
  summary: MonthSummary;
  tips: Tip[];
  emergency: EmergencyStatus;
  health: HealthScore | null;
  series: SeriesPoint[];
  /** Gasto acumulado dia a dia do mês escolhido, contra o ritmo ideal. */
  pace: DayPoint[];
  /** Teto de gasto do mês: 80% da renda (necessidades + desejos). */
  budgetCents: number;
  /** Soma dos lançamentos marcados como "gasto constante" no mês. */
  recurringCents: number;
  addTransactions: (items: NewTransaction[]) => Promise<Transaction[]>;
  updateTransaction: (tx: Transaction) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  loadDemo: () => Promise<void>;
  clearAll: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppProvider');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const mode = isCloudConfigured ? 'cloud' : 'local';
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(mode === 'local');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [month, setMonth] = useState(currentMonthKey());
  const store = useRef<DataStore | null>(null);

  // Sessão (somente nuvem).
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Carrega os dados quando houver store (local sempre; nuvem após login).
  const userId = session?.user.id;
  useEffect(() => {
    if (!sessionLoaded) return;
    let cancelled = false;
    if (mode === 'cloud') {
      if (!userId || !supabase) {
        store.current = null;
        setTransactions([]);
        setSettings(DEFAULT_SETTINGS);
        setDataLoaded(true);
        return;
      }
      store.current = new SupabaseStore(supabase, userId);
    } else {
      store.current = new LocalStore();
    }
    setDataLoaded(false);
    store.current
      .load()
      .then((d) => {
        if (cancelled) return;
        setTransactions(d.transactions);
        setSettings(d.settings);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(`Não foi possível carregar os dados: ${e.message}`))
      .finally(() => !cancelled && setDataLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [sessionLoaded, userId, mode]);

  const summary = useMemo(() => computeMonthSummary(transactions, month, settings), [transactions, month, settings]);
  const tips = useMemo(() => generateTips(transactions, month, settings), [transactions, month, settings]);
  const emergency = useMemo(() => emergencyStatus(transactions, month, settings), [transactions, month, settings]);
  const health = useMemo(() => healthScore(summary, emergency), [summary, emergency]);
  const series = useMemo(() => monthlySeries(transactions, month, 6), [transactions, month]);
  const budgetCents = useMemo(() => Math.round(summary.baseIncomeCents * 0.8), [summary.baseIncomeCents]);
  const pace = useMemo(() => dailySpending(transactions, month, budgetCents), [transactions, month, budgetCents]);
  const recurringCents = useMemo(() => recurringMonthlyCost(transactions, month), [transactions, month]);

  // Notificações: lembretes recorrentes e alertas de orçamento do mês corrente.
  useEffect(() => {
    if (dataLoaded) void syncRecurringNotifications(settings.notifications);
  }, [dataLoaded, settings.notifications]);
  const currentSummary = useMemo(
    () => computeMonthSummary(transactions, currentMonthKey(), settings),
    [transactions, settings],
  );
  useEffect(() => {
    if (dataLoaded) void notifyBudgetAlerts(currentSummary, settings.notifications.budgetAlerts);
  }, [dataLoaded, currentSummary, settings.notifications.budgetAlerts]);

  const need = () => {
    if (!store.current) throw new Error('Sem sessão ativa.');
    return store.current;
  };

  const addTransactions = useCallback(async (items: NewTransaction[]) => {
    const created = await need().addMany(items);
    setTransactions((prev) => [...prev, ...created]);
    return created;
  }, []);

  const updateTransaction = useCallback(async (tx: Transaction) => {
    await need().update(tx);
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? tx : t)));
  }, []);

  const removeTransaction = useCallback(async (id: string) => {
    await need().remove(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const saveSettings = useCallback(async (s: Settings) => {
    await need().saveSettings(s);
    setSettings(s);
  }, []);

  const loadDemo = useCallback(async () => {
    const s = need();
    await s.clearAll();
    await s.saveSettings(DEMO_SETTINGS);
    const created = await s.addMany(buildDemoTransactions());
    setSettings(DEMO_SETTINGS);
    setTransactions(created);
  }, []);

  const clearAll = useCallback(async () => {
    await need().clearAll();
    setTransactions([]);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value: AppState = {
    ready: sessionLoaded && dataLoaded,
    mode,
    session,
    error,
    transactions,
    settings,
    month,
    setMonth,
    summary,
    tips,
    emergency,
    health,
    series,
    pace,
    budgetCents,
    recurringCents,
    addTransactions,
    updateTransaction,
    removeTransaction,
    saveSettings,
    loadDemo,
    clearAll,
    signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
