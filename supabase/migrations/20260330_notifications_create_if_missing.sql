-- Create notifications table if missing (production may never have run earlier migrations).
-- Safe: IF NOT EXISTS, additive policies only.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  type text,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),

  -- Optional fields for future compatibility
  actor_id uuid,
  entity_id uuid,
  story_id uuid,
  group_id uuid,
  message_id uuid
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Users can read own notifications'
  ) THEN
    CREATE POLICY "Users can read own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Users can insert notifications'
  ) THEN
    CREATE POLICY "Users can insert notifications"
    ON public.notifications
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT ON public.notifications TO anon;
