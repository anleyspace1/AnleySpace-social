-- Backfill public.profiles for user IDs present in public.follows but missing from profiles.
-- Symptom: follower/following counts work (follows rows exist) but modals show "No users found"
-- because .in('id', follower_ids) returns no profile rows.
--
-- Diagnostics (run in SQL editor if needed):
--   select f.follower_id
--   from public.follows f
--   left join public.profiles p on p.id = f.follower_id
--   where p.id is null;
--
--   select f.following_id
--   from public.follows f
--   left join public.profiles p on p.id = f.following_id
--   where p.id is null;

WITH orphan_ids AS (
  SELECT DISTINCT f.follower_id AS uid
  FROM public.follows f
  LEFT JOIN public.profiles p ON p.id = f.follower_id
  WHERE p.id IS NULL
    AND f.follower_id IS NOT NULL
  UNION
  SELECT DISTINCT f.following_id AS uid
  FROM public.follows f
  LEFT JOIN public.profiles p ON p.id = f.following_id
  WHERE p.id IS NULL
    AND f.following_id IS NOT NULL
)
INSERT INTO public.profiles (id, username, avatar_url)
SELECT
  u.id,
  COALESCE(
    NULLIF(trim(split_part(COALESCE(u.email, ''), '@', 1)), ''),
    'user_' || left(replace(u.id::text, '-', ''), 8)
  ),
  NULL
FROM auth.users u
INNER JOIN orphan_ids o ON o.uid = u.id
ON CONFLICT (id) DO NOTHING;
