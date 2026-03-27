-- Group chat uses `messages` with `user_id` + `group_id`.
-- Direct messages use `sender_id` + `receiver_id`.
-- Older policies (e.g. only auth.uid() = sender_id) block group inserts when `user_id` is set instead of `sender_id`.

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
DROP POLICY IF EXISTS "Messages are viewable by all users" ON public.messages;
DROP POLICY IF EXISTS "Messages are viewable by authenticated users" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

CREATE POLICY "Users can view messages"
ON public.messages
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    (user_id IS NOT NULL AND auth.uid() = user_id)
    OR (sender_id IS NOT NULL AND auth.uid() = sender_id)
  )
);

-- Realtime: broadcast INSERT/UPDATE/DELETE to subscribed clients (enable in Dashboard if this fails locally).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
