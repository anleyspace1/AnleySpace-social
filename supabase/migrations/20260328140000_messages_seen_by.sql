-- Read receipts for group messages: who has viewed each row.
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS seen_by uuid[] DEFAULT '{}';

COMMENT ON COLUMN public.messages.seen_by IS 'User ids who have read this message (group chat).';

-- Allow group members to update rows (e.g. append to seen_by) for messages in their group.
DROP POLICY IF EXISTS "Group members can update message read state" ON public.messages;

CREATE POLICY "Group members can update message read state"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = messages.group_id AND gm.user_id = auth.uid()
  )
)
WITH CHECK (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = messages.group_id AND gm.user_id = auth.uid()
  )
);
