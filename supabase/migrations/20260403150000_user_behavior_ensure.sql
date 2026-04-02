-- Idempotent ensure for deployments where earlier user_behavior migrations were not applied.
-- Matches app expectations: userBehavior.ts + RewardsPage (action_type includes view, like, comment, share).

CREATE TABLE IF NOT EXISTS public.user_behavior (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  target_type text,
  target_id text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill columns if an older partial table exists
ALTER TABLE public.user_behavior ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE public.user_behavior ADD COLUMN IF NOT EXISTS target_id text;
ALTER TABLE public.user_behavior ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS user_behavior_user_id_created_at_idx
  ON public.user_behavior (user_id, created_at DESC);

ALTER TABLE public.user_behavior ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_behavior_insert_own" ON public.user_behavior;
CREATE POLICY "user_behavior_insert_own"
ON public.user_behavior
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_behavior_select_own" ON public.user_behavior;
CREATE POLICY "user_behavior_select_own"
ON public.user_behavior
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Relax / replace action_type check to include share (safe if constraint missing or outdated)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_behavior_action_type_check'
      AND conrelid = 'public.user_behavior'::regclass
  ) THEN
    ALTER TABLE public.user_behavior DROP CONSTRAINT user_behavior_action_type_check;
  END IF;
END$$;

ALTER TABLE public.user_behavior
  ADD CONSTRAINT user_behavior_action_type_check
  CHECK (action_type IN ('like', 'view', 'comment', 'follow', 'share'));

NOTIFY pgrst, 'reload schema';
