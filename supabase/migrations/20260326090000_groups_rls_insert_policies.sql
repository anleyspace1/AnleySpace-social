-- Groups feature RLS alignment:
-- - group_members: authenticated insert only for own user_id
-- - groups: authenticated insert only when auth.uid() matches creator field
-- - group_posts: authenticated insert only for own user_id

ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.group_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert own membership" ON public.group_members;
CREATE POLICY "Allow authenticated insert own membership"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'groups'
      AND column_name = 'created_by'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated insert own groups" ON public.groups';
    EXECUTE '
      CREATE POLICY "Allow authenticated insert own groups"
      ON public.groups
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = created_by)
    ';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'groups'
      AND column_name = 'creator_id'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated insert own groups" ON public.groups';
    EXECUTE '
      CREATE POLICY "Allow authenticated insert own groups"
      ON public.groups
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = creator_id)
    ';
  END IF;
END
$$;

DROP POLICY IF EXISTS "Allow authenticated insert own group posts" ON public.group_posts;
CREATE POLICY "Allow authenticated insert own group posts"
ON public.group_posts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
