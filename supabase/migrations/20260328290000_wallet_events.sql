-- Optional audit log for wallet / boost flows (additive).

CREATE TABLE IF NOT EXISTS public.wallet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_events_user_id_idx ON public.wallet_events (user_id);
CREATE INDEX IF NOT EXISTS wallet_events_created_at_idx ON public.wallet_events (created_at DESC);

ALTER TABLE public.wallet_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own wallet events"
ON public.wallet_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
