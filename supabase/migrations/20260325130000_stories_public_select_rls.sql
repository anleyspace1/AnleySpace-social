-- Stories: allow anon/authenticated clients to read rows (fixes empty fetch after insert when RLS blocked SELECT).
-- Does not alter INSERT/UPDATE/DELETE policies; adds SELECT only.

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to stories" ON public.stories;

CREATE POLICY "Allow public read access to stories"
ON public.stories
FOR SELECT
USING (true);
