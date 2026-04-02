-- Keep user_wallets in sync AND update profiles.coins (UI + /api/user read profiles.coins).
-- Additive: replaces function body only.

CREATE OR REPLACE FUNCTION public.credit_wallet_coins(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.user_wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_wallets.balance + EXCLUDED.balance;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_coins(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet_coins(uuid, integer) TO service_role;
