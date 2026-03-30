-- Coins on profiles (if missing), viral rewards ledger, and post boosts for ranking.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0;

-- One reward row per post when author earns viral bonus.
CREATE TABLE IF NOT EXISTS public.post_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  rewarded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_rewards_user_id_idx ON public.post_rewards (user_id);

ALTER TABLE public.post_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_rewards_select_authenticated"
ON public.post_rewards
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "post_rewards_insert_authenticated"
ON public.post_rewards
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Boost spend: one row per boost action (user pays coins to raise post visibility).
CREATE TABLE IF NOT EXISTS public.post_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  boost_amount integer NOT NULL CHECK (boost_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_boosts_post_id_idx ON public.post_boosts (post_id);
CREATE INDEX IF NOT EXISTS post_boosts_user_id_idx ON public.post_boosts (user_id);

ALTER TABLE public.post_boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_boosts_select_all"
ON public.post_boosts
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "post_boosts_insert_own"
ON public.post_boosts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.post_rewards IS 'Viral bonus payout ledger (one row per post).';
COMMENT ON TABLE public.post_boosts IS 'Paid boosts: user spends coins to increase post ranking weight.';
