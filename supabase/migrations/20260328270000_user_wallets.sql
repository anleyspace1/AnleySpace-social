-- Per-user coin balance for marketplace monetization (additive).

CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can read own wallet"
ON public.user_wallets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "User can update own wallet"
ON public.user_wallets
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "User can insert own wallet"
ON public.user_wallets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
