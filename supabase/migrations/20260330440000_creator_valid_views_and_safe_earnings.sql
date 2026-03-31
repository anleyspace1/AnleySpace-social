ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS valid_views integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.creator_valid_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watch_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_valid_view_events_lookup_idx
  ON public.creator_valid_view_events (post_id, viewer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.creator_view_payout_state (
  post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  coins_awarded integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.creator_daily_view_earnings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  coins integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE OR REPLACE FUNCTION public.reward_creator_valid_view(
  p_post_id uuid,
  p_viewer_id uuid,
  p_watch_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_valid_views integer;
  v_last_view_at timestamptz;
  v_followers integer;
  v_post_count integer;
  v_entitled_coins integer;
  v_awarded_coins integer;
  v_delta integer;
  v_daily_coins integer;
  v_cap_remaining integer;
  v_to_award integer;
  v_earning_usd numeric;
BEGIN
  IF p_post_id IS NULL OR p_viewer_id IS NULL OR COALESCE(p_watch_seconds, 0) < 7 THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'watch_too_short');
  END IF;

  SELECT p.user_id, COALESCE(p.valid_views, 0)
  INTO v_creator_id, v_valid_views
  FROM public.posts p
  WHERE p.id = p_post_id
  FOR UPDATE;

  IF v_creator_id IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'post_not_found');
  END IF;

  IF v_creator_id = p_viewer_id THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'self_view');
  END IF;

  SELECT e.created_at
  INTO v_last_view_at
  FROM public.creator_valid_view_events e
  WHERE e.post_id = p_post_id
    AND e.viewer_id = p_viewer_id
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_last_view_at IS NOT NULL AND v_last_view_at > (now() - interval '15 minutes') THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'cooldown_15m');
  END IF;

  INSERT INTO public.creator_valid_view_events (post_id, viewer_id, creator_id, watch_seconds)
  VALUES (p_post_id, p_viewer_id, v_creator_id, p_watch_seconds);

  UPDATE public.posts
  SET valid_views = COALESCE(valid_views, 0) + 1
  WHERE id = p_post_id
  RETURNING valid_views INTO v_valid_views;

  SELECT COALESCE(pr.followers_count, 0)
  INTO v_followers
  FROM public.profiles pr
  WHERE pr.id = v_creator_id;

  SELECT COUNT(*)
  INTO v_post_count
  FROM public.posts p
  WHERE p.user_id = v_creator_id;

  IF COALESCE(v_followers, 0) < 200 OR COALESCE(v_post_count, 0) < 5 THEN
    v_earning_usd := (COALESCE(v_valid_views, 0)::numeric / 1000.0) * 0.15;
    RETURN jsonb_build_object(
      'counted', true,
      'postId', p_post_id,
      'validViews', v_valid_views,
      'earningUSD', v_earning_usd,
      'coins', 0
    );
  END IF;

  v_entitled_coins := floor(((COALESCE(v_valid_views, 0)::numeric / 1000.0) * 0.15) * 100.0);

  INSERT INTO public.creator_view_payout_state (post_id, coins_awarded)
  VALUES (p_post_id, 0)
  ON CONFLICT (post_id) DO NOTHING;

  SELECT COALESCE(s.coins_awarded, 0)
  INTO v_awarded_coins
  FROM public.creator_view_payout_state s
  WHERE s.post_id = p_post_id
  FOR UPDATE;

  v_delta := GREATEST(COALESCE(v_entitled_coins, 0) - COALESCE(v_awarded_coins, 0), 0);

  INSERT INTO public.creator_daily_view_earnings (user_id, day, coins)
  VALUES (v_creator_id, current_date, 0)
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT COALESCE(d.coins, 0)
  INTO v_daily_coins
  FROM public.creator_daily_view_earnings d
  WHERE d.user_id = v_creator_id
    AND d.day = current_date
  FOR UPDATE;

  v_cap_remaining := GREATEST(1000 - COALESCE(v_daily_coins, 0), 0);
  v_to_award := LEAST(COALESCE(v_delta, 0), v_cap_remaining);

  IF v_to_award > 0 THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + v_to_award
    WHERE id = v_creator_id;

    UPDATE public.creator_view_payout_state
    SET coins_awarded = COALESCE(coins_awarded, 0) + v_to_award
    WHERE post_id = p_post_id;

    UPDATE public.creator_daily_view_earnings
    SET coins = COALESCE(coins, 0) + v_to_award
    WHERE user_id = v_creator_id
      AND day = current_date;
  END IF;

  v_earning_usd := (COALESCE(v_valid_views, 0)::numeric / 1000.0) * 0.15;

  RETURN jsonb_build_object(
    'counted', true,
    'postId', p_post_id,
    'validViews', v_valid_views,
    'earningUSD', v_earning_usd,
    'coins', COALESCE(v_to_award, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reward_creator_valid_view(uuid, uuid, integer) TO authenticated;
