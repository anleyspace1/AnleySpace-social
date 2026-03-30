-- Ensure wallet deduction RPC exists with the expected signature.
-- Safe row lock + balance check prevents negative balances.

drop function if exists public.deduct_wallet_if_sufficient(integer);

create or replace function public.deduct_wallet_if_sufficient(p_cost integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if p_cost is null or p_cost <= 0 then
    return false;
  end if;

  -- lock row for safe update
  select balance into current_balance
  from public.user_wallets
  where user_id = auth.uid()
  for update;

  -- no wallet found
  if current_balance is null then
    return false;
  end if;

  -- not enough balance
  if current_balance < p_cost then
    return false;
  end if;

  -- deduct coins
  update public.user_wallets
  set balance = balance - p_cost
  where user_id = auth.uid();

  return true;
end;
$$;

grant execute on function public.deduct_wallet_if_sufficient(integer) to authenticated;
