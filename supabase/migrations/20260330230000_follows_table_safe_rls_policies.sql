-- Safe, additive RLS + policies for public.follows (production + local).
-- Also see 20260323170000_follows_create_table_if_missing.sql (runs before dedupe migration).
-- Does not drop existing policies or alter unrelated tables.

-- Ensure table exists (idempotent; safe if 231700 already ran)
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS follows_follower_following_unique_idx
  ON public.follows (follower_id, following_id);

-- RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- 3) Named policies — create only if missing (no drops)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'follows'
      AND policyname = 'Users can read follows'
  ) THEN
    CREATE POLICY "Users can read follows"
    ON public.follows
    FOR SELECT
    USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'follows'
      AND policyname = 'Users can follow'
  ) THEN
    CREATE POLICY "Users can follow"
    ON public.follows
    FOR INSERT
    WITH CHECK (auth.uid() = follower_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'follows'
      AND policyname = 'Users can unfollow'
  ) THEN
    CREATE POLICY "Users can unfollow"
    ON public.follows
    FOR DELETE
    USING (auth.uid() = follower_id);
  END IF;
END $$;

-- Standard Supabase role access (idempotent if already granted)
GRANT SELECT ON public.follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
