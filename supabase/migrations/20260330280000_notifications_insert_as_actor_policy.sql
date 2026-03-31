-- Allow authenticated users to insert a notification row where they are the actor
-- (liker, commenter, follower, DM sender) and user_id is the recipient.
-- Existing "Users can insert notifications" (auth.uid() = user_id) only allows self-targeted rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Users can insert notifications as actor'
  ) THEN
    CREATE POLICY "Users can insert notifications as actor"
    ON public.notifications
    FOR INSERT
    TO authenticated
    WITH CHECK (
      auth.uid() = actor_id
      AND user_id IS NOT NULL
      AND actor_id IS NOT NULL
      AND user_id IS DISTINCT FROM actor_id
    );
  END IF;
END $$;
