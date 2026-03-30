-- Followers / Following modals: load public.profiles by id after querying follows.
-- Production: if profiles RLS blocks SELECT for other users' rows, modals show "No users found".
-- Additive only: create policy if missing; enable RLS; grants.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can read public profiles'
  ) THEN
    CREATE POLICY "Users can read public profiles"
    ON public.profiles
    FOR SELECT
    USING (true);
  END IF;
END $$;

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.profiles TO authenticated;
