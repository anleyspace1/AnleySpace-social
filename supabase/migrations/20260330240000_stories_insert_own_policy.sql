-- Additive policy for story inserts by authenticated owner.
-- Keeps existing policies untouched while making owner-write intent explicit.

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own stories" ON public.stories;

CREATE POLICY "Users can insert their own stories"
ON public.stories
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
