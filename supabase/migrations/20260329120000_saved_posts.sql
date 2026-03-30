-- Saved posts (bookmarks): one row per user per post.
-- post_id references public.posts in app logic; FK omitted if posts is created outside migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.saved_posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_posts_user_post_unique UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS saved_posts_user_id_idx ON public.saved_posts (user_id);
CREATE INDEX IF NOT EXISTS saved_posts_post_id_idx ON public.saved_posts (post_id);
CREATE INDEX IF NOT EXISTS saved_posts_user_created_idx ON public.saved_posts (user_id, created_at DESC);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_posts_select_own"
ON public.saved_posts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "saved_posts_insert_own"
ON public.saved_posts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_posts_delete_own"
ON public.saved_posts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

COMMENT ON TABLE public.saved_posts IS 'User bookmarks for feed posts (same post_id as public.posts.id).';
