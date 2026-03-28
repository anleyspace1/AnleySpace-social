-- New table only: saved_marketplace (does not alter existing tables).

CREATE TABLE IF NOT EXISTS public.saved_marketplace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_marketplace_user_product_unique UNIQUE (user_id, product_id)
);

ALTER TABLE public.saved_marketplace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_marketplace_select_own"
ON public.saved_marketplace
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "saved_marketplace_insert_own"
ON public.saved_marketplace
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_marketplace_delete_own"
ON public.saved_marketplace
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS saved_marketplace_user_id_idx ON public.saved_marketplace (user_id);
CREATE INDEX IF NOT EXISTS saved_marketplace_product_id_idx ON public.saved_marketplace (product_id);
