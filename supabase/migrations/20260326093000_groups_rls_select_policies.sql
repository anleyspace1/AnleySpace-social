-- Groups read access policy alignment to prevent empty refresh results.
-- Keep inserts constrained by existing authenticated ownership policies.

ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read groups" ON public.groups;
CREATE POLICY "Allow authenticated read groups"
ON public.groups
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated read group memberships" ON public.group_members;
CREATE POLICY "Allow authenticated read group memberships"
ON public.group_members
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated read group posts" ON public.group_posts;
CREATE POLICY "Allow authenticated read group posts"
ON public.group_posts
FOR SELECT
TO authenticated
USING (true);
