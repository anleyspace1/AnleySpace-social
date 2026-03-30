-- Per-user feed/reels personalization (watch time + interest), synced from the client.

CREATE TABLE IF NOT EXISTS public.user_personalization (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  watch_time jsonb NOT NULL DEFAULT '{}'::jsonb,
  interest jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_personalization_updated_at_idx
  ON public.user_personalization (updated_at DESC);

ALTER TABLE public.user_personalization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_personalization_select_own"
ON public.user_personalization
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user_personalization_insert_own"
ON public.user_personalization
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_personalization_update_own"
ON public.user_personalization
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.user_personalization IS 'Client-synced personalization: watch_time map (post id -> seconds), interest counters.';
