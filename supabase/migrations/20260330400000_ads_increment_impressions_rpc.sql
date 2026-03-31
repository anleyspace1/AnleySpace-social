CREATE OR REPLACE FUNCTION public.increment_ads_impressions(p_ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ad_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ads
  SET impressions = COALESCE(impressions, 0) + 1
  WHERE id = p_ad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ads_impressions(uuid) TO anon, authenticated;
