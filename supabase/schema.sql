-- Finanças Claras — esquema do Supabase.
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run.
-- É seguro rodar mais de uma vez.

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date         date not null,
  description  text not null,
  amount_cents bigint not null check (amount_cents > 0),
  type         text not null check (type in ('income', 'expense')),
  category_id  text not null,
  source       text not null default 'manual' check (source in ('manual', 'import')),
  external_id  text,
  recurring    boolean not null default false,
  created_at   timestamptz not null default now(),
  -- Evita importar o mesmo lançamento duas vezes (NULL não conflita, então lançamentos manuais não são afetados).
  unique (user_id, external_id)
);

-- Para quem já criou a tabela antes desta coluna existir:
alter table public.transactions add column if not exists recurring boolean not null default false;

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

create table if not exists public.settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Segurança: cada pessoa só enxerga e altera os próprios dados.
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "settings_own" on public.settings;
create policy "settings_own" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
