-- Must run before 20260323183000_dedupe_and_unique_follows.sql (references public.follows).
-- Idempotent: safe if table already exists from manual setup.

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);
