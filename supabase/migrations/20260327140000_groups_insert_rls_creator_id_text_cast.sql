-- Production: RLS insert can fail if creator_id type does not compare cleanly to auth.uid() (uuid).
-- Recreate INSERT policy with explicit text comparison so uuid and text columns both work.

DROP POLICY IF EXISTS "Allow authenticated insert own groups" ON public.groups;

CREATE POLICY "Allow authenticated insert own groups"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (
  creator_id IS NOT NULL
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = creator_id::text
);
