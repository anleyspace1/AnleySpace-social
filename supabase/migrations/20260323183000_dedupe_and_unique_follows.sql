-- Ensure follows has one row per relationship (follower_id, following_id).
-- This prevents inflated follower/following counts from duplicate rows.

DELETE FROM public.follows a
USING public.follows b
WHERE a.ctid < b.ctid
  AND a.follower_id = b.follower_id
  AND a.following_id = b.following_id;

CREATE UNIQUE INDEX IF NOT EXISTS follows_follower_following_unique_idx
ON public.follows (follower_id, following_id);

