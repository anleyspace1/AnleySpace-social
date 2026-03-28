-- Product view analytics: atomic increment via RPC (no broad UPDATE policy on marketplace).

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_marketplace_view(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketplace
  SET view_count = view_count + 1
  WHERE id = listing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_marketplace_view(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_marketplace_view(uuid) TO authenticated;
