-- Ensure public.post_monetization exists for reel/post monetization boosts.
-- Some databases never applied 20260330150000_monetization_system.sql; PostgREST then errors with
-- "Could not find the table public.post_monetization".
--
-- Schema matches server.ts /api/monetization/* (creator_id + tier + earnings columns; not the generic user_id/boost_type shape).

CREATE TABLE IF NOT EXISTS public.post_monetization (
  post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('basic', 'growth', 'pro', 'viral', 'mega')),
  price_coins integer NOT NULL CHECK (price_coins > 0),
  max_boost_earnings_cents integer NOT NULL CHECK (max_boost_earnings_cents >= 0),
  boost_earnings_cents integer NOT NULL DEFAULT 0 CHECK (boost_earnings_cents >= 0),
  organic_earnings_cents bigint NOT NULL DEFAULT 0 CHECK (organic_earnings_cents >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_monetization_creator_idx ON public.post_monetization (creator_id);
CREATE INDEX IF NOT EXISTS post_monetization_expires_idx ON public.post_monetization (expires_at);

ALTER TABLE public.post_monetization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_monetization_select_all" ON public.post_monetization;
CREATE POLICY "post_monetization_select_all"
ON public.post_monetization
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "post_monetization_insert_own" ON public.post_monetization;
CREATE POLICY "post_monetization_insert_own"
ON public.post_monetization
FOR INSERT
TO authenticated
WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "post_monetization_update_own" ON public.post_monetization;
CREATE POLICY "post_monetization_update_own"
ON public.post_monetization
FOR UPDATE
TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

COMMENT ON TABLE public.post_monetization IS 'Active monetization boost per post; creator_id is the boosted post owner.';
