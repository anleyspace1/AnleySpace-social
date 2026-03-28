-- Marketplace product likes (additive; does not alter existing tables).

CREATE TABLE IF NOT EXISTS public.marketplace_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.marketplace(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS marketplace_likes_product_id_idx ON public.marketplace_likes (product_id);
CREATE INDEX IF NOT EXISTS marketplace_likes_user_id_idx ON public.marketplace_likes (user_id);

ALTER TABLE public.marketplace_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow like insert"
ON public.marketplace_likes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow like delete"
ON public.marketplace_likes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow read likes"
ON public.marketplace_likes
FOR SELECT
TO authenticated
USING (true);
