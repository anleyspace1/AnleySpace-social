CREATE TABLE IF NOT EXISTS public.user_behavior (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('like', 'view', 'comment', 'follow')),
  target_type text NOT NULL CHECK (target_type IN ('post', 'video', 'user')),
  target_id text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
