-- Ensure wallet table exists for marketplace coin flows.
-- Additive/idempotent and safe to run on environments where it already exists.

create table if not exists public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coins integer not null default 0,
  -- Compatibility with existing wallet RPC/functions already using `balance`.
  balance integer not null default 0,
  created_at timestamp with time zone not null default now()
);

-- Wallet operations rely on one row per user.
create unique index if not exists user_wallets_user_id_key on public.user_wallets (user_id);

alter table public.user_wallets enable row level security;

drop policy if exists "Users can view own wallet" on public.user_wallets;
create policy "Users can view own wallet"
on public.user_wallets
for select
using (auth.uid() = user_id);

drop policy if exists "Users can update own wallet" on public.user_wallets;
create policy "Users can update own wallet"
on public.user_wallets
for update
using (auth.uid() = user_id);

-- Required for first-wallet creation from client flows.
drop policy if exists "Users can insert own wallet" on public.user_wallets;
create policy "Users can insert own wallet"
on public.user_wallets
for insert
with check (auth.uid() = user_id);
