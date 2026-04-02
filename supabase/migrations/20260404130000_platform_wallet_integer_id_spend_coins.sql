-- Fix platform_wallet id type (uuid/text 'main' → integer) and platform_spend_coins so wallet updates use id = 1.
-- Resolves: invalid input syntax for type integer: 'main'; aligns wallet row with numeric PK.
-- Dependent SECURITY DEFINER functions/triggers updated only where they touch platform_wallet (same behavior, id = 1).

DO $$
DECLARE
  coltype text;
  total bigint;
  tbl_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_wallet'
  ) INTO tbl_exists;

  SELECT c.data_type INTO coltype
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'platform_wallet'
    AND c.column_name = 'id';

  IF NOT tbl_exists THEN
    CREATE TABLE public.platform_wallet (
      id integer PRIMARY KEY,
      coins integer NOT NULL DEFAULT 0
    );
    INSERT INTO public.platform_wallet (id, coins) VALUES (1, 0);
    ALTER TABLE public.platform_wallet ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "platform_wallet_admin_select" ON public.platform_wallet;
    CREATE POLICY "platform_wallet_admin_select"
    ON public.platform_wallet
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    );
  ELSIF coltype IN ('uuid', 'text', 'character varying') THEN
    SELECT COALESCE(SUM(coins), 0) INTO total FROM public.platform_wallet;
    DROP TABLE public.platform_wallet CASCADE;
    CREATE TABLE public.platform_wallet (
      id integer PRIMARY KEY,
      coins integer NOT NULL DEFAULT 0
    );
    INSERT INTO public.platform_wallet (id, coins)
    VALUES (1, LEAST(COALESCE(total, 0), 2147483647)::integer);
    ALTER TABLE public.platform_wallet ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "platform_wallet_admin_select" ON public.platform_wallet;
    CREATE POLICY "platform_wallet_admin_select"
    ON public.platform_wallet
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    );
  END IF;
END $$;

INSERT INTO public.platform_wallet (id, coins)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Atomic: deduct user, credit platform row id = 1, log transaction
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

  UPDATE public.platform_wallet
  SET coins = coins + p_amount
  WHERE id = 1;

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

CREATE OR REPLACE FUNCTION public.revert_platform_spend(p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;
  UPDATE public.platform_wallet
  SET coins = GREATEST(0, coins - p_amount)
  WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_platform_spend(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_platform_spend(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_monthly_reward(
  p_activity_percent numeric DEFAULT 0,
  p_month date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pts bigint;
  gpts bigint;
  effective_pts bigint;
  reward int;
  pw_coins bigint;
  claim_id uuid;
  claim_month date;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT COALESCE(points, 0)::bigint, COALESCE(gift_points, 0)::bigint
  INTO pts, gpts
  FROM public.profiles
  WHERE id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  effective_pts := GREATEST(pts, gpts);

  IF effective_pts < 10000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_eligible');
  END IF;

  reward := (effective_pts / 100)::int;
  IF reward <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zero_reward');
  END IF;

  claim_month := date_trunc('month', COALESCE(p_month, (CURRENT_TIMESTAMP AT TIME ZONE 'utc')::date))::date;

  IF EXISTS (
    SELECT 1 FROM public.rewards_claims WHERE user_id = uid AND month = claim_month
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  SELECT coins INTO pw_coins FROM public.platform_wallet WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'platform_wallet_missing');
  END IF;
  IF COALESCE(pw_coins, 0) < reward THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_platform_wallet');
  END IF;

  UPDATE public.platform_wallet SET coins = coins - reward WHERE id = 1;

  UPDATE public.profiles SET coins = COALESCE(coins, 0) + reward WHERE id = uid;

  INSERT INTO public.transactions (id, user_id, type, amount, description, target)
  VALUES (
    gen_random_uuid(),
    uid,
    'spend',
    reward,
    'Reward payout',
    'reward_payout'
  );

  INSERT INTO public.rewards_claims (id, user_id, points_snapshot, reward_coins, activity_percent, month, created_at)
  VALUES (gen_random_uuid(), uid, effective_pts::int, reward, p_activity_percent, claim_month, now())
  RETURNING id INTO claim_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reward_coins', reward,
    'claim_id', claim_id,
    'points_snapshot', effective_pts,
    'month', claim_month
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_monthly_reward(numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_monthly_reward(numeric, date) TO service_role;

CREATE OR REPLACE FUNCTION public.gift_transactions_after_insert_platform_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pc integer;
BEGIN
  pc := COALESCE(NEW.platform_coins, 0);
  IF pc <= 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.platform_wallet SET coins = coins + pc WHERE id = 1;

  INSERT INTO public.transactions (id, user_id, type, amount, description, target)
  VALUES (
    gen_random_uuid(),
    NULL,
    'earn',
    pc,
    'Platform gift fee id ' || NEW.id::text,
    'gift_platform_fee'
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.gift_transactions_after_insert_platform_fee() IS
  'Credits platform_wallet (id = 1) from gift_transactions.platform_coins and logs transactions (earn / gift_platform_fee) in the same transaction as the gift insert.';

NOTIFY pgrst, 'reload schema';
