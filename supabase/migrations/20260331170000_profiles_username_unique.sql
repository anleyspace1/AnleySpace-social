-- UNIQUE constraint on public.profiles.username
-- Does not delete or modify rows. If duplicates exist, migration fails with a message.
--
-- Manual check (run in SQL editor before applying):
--   SELECT username, COUNT(*) AS n, array_agg(id::text ORDER BY id) AS profile_ids
--   FROM public.profiles
--   WHERE username IS NOT NULL
--   GROUP BY username
--   HAVING COUNT(*) > 1;

DO $$
DECLARE
  r RECORD;
  dup_lines text[] := ARRAY[]::text[];
BEGIN
  FOR r IN
    SELECT
      username,
      COUNT(*)::bigint AS n,
      array_agg(id::text ORDER BY id) AS profile_ids
    FROM public.profiles
    WHERE username IS NOT NULL
    GROUP BY username
    HAVING COUNT(*) > 1
  LOOP
    dup_lines := array_append(
      dup_lines,
      format('username=%L count=%s ids=%s', r.username, r.n, r.profile_ids::text)
    );
  END LOOP;

  IF cardinality(dup_lines) > 0 THEN
    RAISE EXCEPTION
      'profiles.username has duplicates; migration aborted. Duplicates: %',
      array_to_string(dup_lines, ' | ');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT unique_username UNIQUE (username);
