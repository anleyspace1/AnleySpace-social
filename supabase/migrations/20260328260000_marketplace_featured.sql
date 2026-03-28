-- Featured listings (additive).

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS featured_until timestamptz;

-- Allow sellers to update their own listing (e.g. toggle featured).
DROP POLICY IF EXISTS "Allow owner update own marketplace row" ON public.marketplace;
CREATE POLICY "Allow owner update own marketplace row"
ON public.marketplace
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
