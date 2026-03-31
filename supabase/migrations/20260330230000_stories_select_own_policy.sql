-- Additive RLS policy: authenticated users can explicitly read their own stories.
-- Keeps existing policies (including public read) untouched.

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select_own" ON public.stories;

CREATE POLICY "stories_select_own"
ON public.stories
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
