import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type Settings, type Transaction } from '@/engine/types';

export type NewTransaction = Omit<Transaction, 'id'>;

/** Contrato único de persistência: o app funciona igual em modo local e na nuvem. */
export interface DataStore {
  load(): Promise<{ transactions: Transaction[]; settings: Settings }>;
  addMany(items: NewTransaction[]): Promise<Transaction[]>;
  update(tx: Transaction): Promise<void>;
  remove(id: string): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  clearAll(): Promise<void>;
}

function mergeSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    budgetOverrides: { ...(raw?.budgetOverrides ?? {}) },
    aliases: { ...(raw?.aliases ?? {}) },
    incomeSources: raw?.incomeSources ?? [],
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(raw?.notifications ?? {}) },
  };
}

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------- Local
const K_TX = 'fc:transactions:v1';
const K_SETTINGS = 'fc:settings:v1';

export class LocalStore implements DataStore {
  private cache: Transaction[] | null = null;

  private async read(): Promise<Transaction[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await AsyncStorage.getItem(K_TX);
      this.cache = raw ? (JSON.parse(raw) as Transaction[]) : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async write(list: Transaction[]) {
    this.cache = list;
    await AsyncStorage.setItem(K_TX, JSON.stringify(list));
  }

  async load() {
    const raw = await AsyncStorage.getItem(K_SETTINGS).catch(() => null);
    let settings: Settings;
    try {
      settings = mergeSettings(raw ? JSON.parse(raw) : null);
    } catch {
      settings = mergeSettings(null);
    }
    return { transactions: await this.read(), settings };
  }

  async addMany(items: NewTransaction[]) {
    const created = items.map((i) => ({ ...i, id: uid() }));
    await this.write([...(await this.read()), ...created]);
    return created;
  }

  async update(tx: Transaction) {
    await this.write((await this.read()).map((t) => (t.id === tx.id ? tx : t)));
  }

  async remove(id: string) {
    await this.write((await this.read()).filter((t) => t.id !== id));
  }

  async saveSettings(settings: Settings) {
    await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(settings));
  }

  async clearAll() {
    this.cache = [];
    await AsyncStorage.multiRemove([K_TX, K_SETTINGS]);
  }
}

// ------------------------------------------------------------- Supabase
interface TxRow {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  type: 'income' | 'expense';
  category_id: string;
  source: 'manual' | 'import';
  external_id: string | null;
  recurring: boolean | null;
}

const COLS = 'id,date,description,amount_cents,type,category_id,source,external_id,recurring';
const PAGE = 1000;

const fromRow = (r: TxRow): Transaction => ({
  id: r.id,
  date: r.date,
  description: r.description,
  amountCents: Number(r.amount_cents),
  type: r.type,
  categoryId: r.category_id,
  source: r.source,
  externalId: r.external_id,
  recurring: r.recurring ?? false,
});

const toRow = (t: NewTransaction) => ({
  date: t.date,
  description: t.description,
  amount_cents: t.amountCents,
  type: t.type,
  category_id: t.categoryId,
  source: t.source,
  external_id: t.externalId ?? null,
  recurring: t.recurring ?? false,
});

export class SupabaseStore implements DataStore {
  constructor(
    private db: SupabaseClient,
    private userId: string,
  ) {}

  async load() {
    const transactions: Transaction[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from('transactions')
        .select(COLS)
        .order('date', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      transactions.push(...(data as TxRow[]).map(fromRow));
      if (!data || data.length < PAGE) break;
    }
    const { data: s, error: se } = await this.db.from('settings').select('data').maybeSingle();
    if (se) throw new Error(se.message);
    return { transactions, settings: mergeSettings(s?.data as Partial<Settings> | undefined) };
  }

  async addMany(items: NewTransaction[]) {
    const created: Transaction[] = [];
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500).map(toRow);
      const { data, error } = await this.db.from('transactions').insert(chunk).select(COLS);
      if (error) throw new Error(error.message);
      created.push(...(data as TxRow[]).map(fromRow));
    }
    return created;
  }

  async update(tx: Transaction) {
    const { error } = await this.db.from('transactions').update(toRow(tx)).eq('id', tx.id);
    if (error) throw new Error(error.message);
  }

  async remove(id: string) {
    const { error } = await this.db.from('transactions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async saveSettings(settings: Settings) {
    const { error } = await this.db
      .from('settings')
      .upsert({ user_id: this.userId, data: settings, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  async clearAll() {
    const a = await this.db.from('transactions').delete().eq('user_id', this.userId);
    if (a.error) throw new Error(a.error.message);
    const b = await this.db.from('settings').delete().eq('user_id', this.userId);
    if (b.error) throw new Error(b.error.message);
  }
}
