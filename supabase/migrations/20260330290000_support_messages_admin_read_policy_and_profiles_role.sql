-- Ensure admin support-message visibility prerequisites exist.
-- Additive only: do not remove existing policies.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text;

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_messages'
      AND policyname = 'support_admin_read_all'
  ) THEN
    CREATE POLICY "support_admin_read_all"
    ON public.support_messages
    FOR SELECT
    TO authenticated
    USING (
      exists (
        select 1 from profiles
        where profiles.id = auth.uid()
          and profiles.role = 'admin'
      )
    );
  END IF;
END $$;
