-- =============================================================================
-- groups.creator_id: data cleanup, UUID + NOT NULL, INSERT RLS
-- =============================================================================
-- Step 1: Backfill creator_id from an existing member when possible (minimal data loss).
-- Step 2: Delete child rows then groups that still have NULL creator_id (orphans).
-- Step 3: Ensure column type is uuid and NOT NULL.
-- Step 4: INSERT policy — only authenticated role; creator_id must equal auth.uid().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Backfill: set creator_id from any group_member row for that group (first match).
--    Adjust if you prefer only role IN ('admin','creator').
-- -----------------------------------------------------------------------------
UPDATE public.groups g
SET creator_id = sub.user_id
FROM (
  SELECT DISTINCT ON (gm.group_id)
    gm.group_id,
    gm.user_id
  FROM public.group_members gm
  WHERE gm.user_id IS NOT NULL
  ORDER BY gm.group_id, gm.role DESC NULLS LAST
) AS sub
WHERE g.id = sub.group_id
  AND g.creator_id IS NULL;

-- -----------------------------------------------------------------------------
-- 2) Remove dependent rows for groups that still have NULL creator_id, then delete
--    those groups. Uses dynamic checks so migration survives missing optional tables.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'group_id'
  ) THEN
    DELETE FROM public.posts
    WHERE group_id IN (SELECT id FROM public.groups WHERE creator_id IS NULL);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'group_id'
  ) THEN
    DELETE FROM public.messages
    WHERE group_id IN (SELECT id FROM public.groups WHERE creator_id IS NULL);
  END IF;
END $$;

DELETE FROM public.group_members
WHERE group_id IN (SELECT id FROM public.groups WHERE creator_id IS NULL);

DELETE FROM public.groups
WHERE creator_id IS NULL;

-- -----------------------------------------------------------------------------
-- 3) Keep uuid type: if column is text/varchar, cast (safe after NULLs removed).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'groups'
      AND column_name = 'creator_id'
      AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE public.groups
      ALTER COLUMN creator_id TYPE uuid
      USING creator_id::uuid;
  END IF;
END $$;

ALTER TABLE public.groups
  ALTER COLUMN creator_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) RLS: authenticated inserts only; creator_id must match JWT user (uuid).
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert own groups" ON public.groups;

CREATE POLICY "Allow authenticated insert own groups"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (
  creator_id IS NOT NULL
  AND auth.uid() IS NOT NULL
  AND creator_id = auth.uid()
);
