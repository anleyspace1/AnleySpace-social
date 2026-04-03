-- Client-callable boost for static hosts (Vercel) where POST /api/monetization/boost does not exist.
-- Mirrors server.ts POST /api/monetization/boost: spend coins, upsert post_monetization, post_boosts, activity points.
-- Uses auth.uid() only — cannot spend another user's coins.

CREATE OR REPLACE FUNCTION public.monetization_boost_purchase(p_post_id uuid, p_tier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  t text := lower(trim(p_tier));
  price_coins integer;
  max_boost_cents integer;
  creator uuid;
  spend_result jsonb;
  expires_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  IF t = 'basic' THEN
    price_coins := 200;
    max_boost_cents := 760;
  ELSIF t = 'growth' THEN
    price_coins := 500;
    max_boost_cents := 1900;
  ELSIF t = 'pro' THEN
    price_coins := 1000;
    max_boost_cents := 3800;
  ELSIF t = 'viral' THEN
    price_coins := 2500;
    max_boost_cents := 9500;
  ELSIF t = 'mega' THEN
    price_coins := 5000;
    max_boost_cents := 19000;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Missing postId or invalid tier');
  END IF;

  SELECT user_id INTO creator FROM public.posts WHERE id = p_post_id;
  IF creator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Post not found');
  END IF;
  IF creator <> uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the post owner can activate monetization boost');
  END IF;

  spend_result := public.platform_spend_coins(uid, price_coins, 'monetization_boost');
  IF COALESCE((spend_result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    IF (spend_result->>'error') = 'insufficient_coins' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error',
        format('Need at least %s coins for %s boost', price_coins, t)
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error',
      COALESCE(spend_result->>'error', 'Could not deduct coins')
    );
  END IF;

  expires_at := (now() AT TIME ZONE 'utc') + interval '30 days';

  INSERT INTO public.post_monetization (
    post_id,
    creator_id,
    tier,
    price_coins,
    max_boost_earnings_cents,
    boost_earnings_cents,
    organic_earnings_cents,
    expires_at
  )
  VALUES (
    p_post_id,
    uid,
    t,
    price_coins,
    max_boost_cents,
    0,
    0,
    expires_at
  )
  ON CONFLICT (post_id) DO UPDATE SET
    creator_id = EXCLUDED.creator_id,
    tier = EXCLUDED.tier,
    price_coins = EXCLUDED.price_coins,
    max_boost_earnings_cents = EXCLUDED.max_boost_earnings_cents,
    boost_earnings_cents = 0,
    organic_earnings_cents = 0,
    expires_at = EXCLUDED.expires_at;

  INSERT INTO public.post_boosts (post_id, user_id, boost_amount)
  VALUES (p_post_id, uid, price_coins);

  UPDATE public.profiles
  SET
    gift_points = COALESCE(gift_points, 0) + price_coins::bigint,
    points = COALESCE(points, 0) + price_coins::bigint
  WHERE id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'tier', t,
    'expiresAt', expires_at,
    'priceCoins', price_coins
  );
END;
$$;

COMMENT ON FUNCTION public.monetization_boost_purchase(uuid, text) IS
  'Boost a post for tips/gifts (30d); deducts coins via platform_spend_coins; for SPA production without Express API.';

REVOKE ALL ON FUNCTION public.monetization_boost_purchase(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monetization_boost_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monetization_boost_purchase(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
