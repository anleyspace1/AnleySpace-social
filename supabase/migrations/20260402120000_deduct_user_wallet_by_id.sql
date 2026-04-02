-- Server-side atomic deduction from user_wallets by user id (service role).
-- Syncs profiles.coins for UI consistency with credit_wallet_coins / marketplace buy checks.

CREATE OR REPLACE FUNCTION public.deduct_user_wallet_by_id(p_user_id uuid, p_cost integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF p_user_id IS NULL OR p_cost IS NULL OR p_cost <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  UPDATE public.user_wallets
  SET balance = balance - p_cost
  WHERE user_id = p_user_id AND balance >= p_cost
  RETURNING balance INTO v_new;

  IF v_new IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient');
  END IF;

  UPDATE public.profiles
  SET coins = GREATEST(0, COALESCE(coins, 0) - p_cost)
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_user_wallet_by_id(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_user_wallet_by_id(uuid, integer) TO service_role;
