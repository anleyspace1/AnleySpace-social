-- Client-side follow/unfollow uses anon key + RLS. Allow public read of edges (follower lists),
-- and allow authenticated users to insert/delete only their own follower_id rows.

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follows are viewable by all users" ON public.follows;
DROP POLICY IF EXISTS "follows_select_public" ON public.follows;
DROP POLICY IF EXISTS "follows_insert_own" ON public.follows;
DROP POLICY IF EXISTS "follows_delete_own" ON public.follows;

CREATE POLICY "follows_select_public"
ON public.follows
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "follows_insert_own"
ON public.follows
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_own"
ON public.follows
FOR DELETE
TO authenticated
USING (auth.uid() = follower_id);
