-- AnleySpace monetization: post boost unlock, gift splits, points, influencer pool (additive).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gift_points bigint NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trust_score numeric NOT NULL DEFAULT 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reward_tier text;

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

CREATE TABLE IF NOT EXISTS public.gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins > 0),
  creator_coins integer NOT NULL,
  platform_coins integer NOT NULL,
  pool_coins integer NOT NULL,
  points_to_sender integer NOT NULL DEFAULT 0,
  boost_cents_applied integer NOT NULL DEFAULT 0,
  organic_cents_applied integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'reversed')),
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_transactions_post_idx ON public.gift_transactions (post_id);
CREATE INDEX IF NOT EXISTS gift_transactions_sender_idx ON public.gift_transactions (sender_id);

ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gift_transactions_select_parties" ON public.gift_transactions;
CREATE POLICY "gift_transactions_select_parties"
ON public.gift_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = creator_id);

CREATE TABLE IF NOT EXISTS public.influencer_pool_balance (
  id text PRIMARY KEY DEFAULT 'default',
  balance_coins bigint NOT NULL DEFAULT 0
);

INSERT INTO public.influencer_pool_balance (id, balance_coins)
VALUES ('default', 0)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.post_monetization IS 'Active monetization boost per post (30d, capped boost-tracked earnings).';
COMMENT ON TABLE public.gift_transactions IS 'Gift/tip ledger: 60% creator, 30% platform reserve, 10% influencer pool; points to sender.';
