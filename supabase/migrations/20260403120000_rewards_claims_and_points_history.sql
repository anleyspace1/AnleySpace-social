-- Rewards: claims ledger, points history audit, atomic monthly claim RPC (Supabase-native).

CREATE TABLE IF NOT EXISTS public.rewards_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points_snapshot integer NOT NULL,
  reward_coins integer NOT NULL CHECK (reward_coins > 0),
  activity_percent numeric NOT NULL DEFAULT 0,
  month date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS rewards_claims_user_idx ON public.rewards_claims (user_id);
CREATE INDEX IF NOT EXISTS rewards_claims_created_idx ON public.rewards_claims (created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_points_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('gift', 'like', 'comment', 'share', 'boost', 'view', 'follow', 'other')),
  points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_points_history_user_idx ON public.user_points_history (user_id);
CREATE INDEX IF NOT EXISTS user_points_history_created_idx ON public.user_points_history (created_at DESC);

ALTER TABLE public.rewards_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_points_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rewards_claims_select_own" ON public.rewards_claims;
CREATE POLICY "rewards_claims_select_own"
ON public.rewards_claims
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_points_history_select_own" ON public.user_points_history;
CREATE POLICY "user_points_history_select_own"
ON public.user_points_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Atomic claim: eligibility from GREATEST(profiles.points, profiles.gift_points), reward = floor(effective/100),
-- one claim per user per calendar month, credits profiles.coins, debits platform_wallet, logs transactions.
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
  pw_id uuid;
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

  SELECT id, coins INTO pw_id, pw_coins FROM public.platform_wallet LIMIT 1 FOR UPDATE;
  IF pw_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'platform_wallet_missing');
  END IF;
  IF COALESCE(pw_coins, 0) < reward THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_platform_wallet');
  END IF;

  UPDATE public.platform_wallet SET coins = coins - reward WHERE id = pw_id;

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

COMMENT ON TABLE public.rewards_claims IS 'Monthly reward claims; one row per user per calendar month.';
COMMENT ON TABLE public.user_points_history IS 'Append-only log of point deltas with coarse source.';
COMMENT ON FUNCTION public.claim_monthly_reward(numeric, date) IS 'Credits user coins from platform_wallet; logs spend transaction target reward_payout.';

NOTIFY pgrst, 'reload schema';
