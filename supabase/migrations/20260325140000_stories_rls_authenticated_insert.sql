-- Allow authenticated role (JWT) to insert stories. Does not remove or replace other policies.
DROP POLICY IF EXISTS "Allow authenticated insert to stories" ON public.stories;

CREATE POLICY "Allow authenticated insert to stories"
ON public.stories
FOR INSERT
TO authenticated
WITH CHECK (true);
