-- Allow platform_spend_coins target 'monetization_boost' for /api/monetization/boost revenue tracking.

CREATE OR REPLACE FUNCTION public.platform_spend_coins(
  p_user_id uuid,
  p_amount integer,
  p_target text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance int;
  v_pw_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_target IS NULL OR p_target NOT IN ('boost', 'ads', 'monetization_boost') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) - p_amount
  WHERE id = p_user_id AND COALESCE(coins, 0) >= p_amount
  RETURNING coins INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_coins');
  END IF;

  SELECT id INTO v_pw_id FROM public.platform_wallet LIMIT 1 FOR UPDATE;
  IF v_pw_id IS NULL THEN
    INSERT INTO public.platform_wallet (coins) VALUES (p_amount) RETURNING id INTO v_pw_id;
  ELSE
    UPDATE public.platform_wallet SET coins = coins + p_amount WHERE id = v_pw_id;
  END IF;

  INSERT INTO public.transactions (id, user_id, type, amount, description, target)
  VALUES (
    gen_random_uuid(),
    p_user_id,
    'spend',
    p_amount,
    'Platform spend: ' || p_target,
    p_target
  );

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_spend_coins(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_spend_coins(uuid, integer, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.revert_platform_spend(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
