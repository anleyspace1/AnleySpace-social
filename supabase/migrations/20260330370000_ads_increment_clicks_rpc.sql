CREATE OR REPLACE FUNCTION public.increment_ads_clicks(p_ad_id uuid)
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
  SET clicks = COALESCE(clicks, 0) + 1
  WHERE id = p_ad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ads_clicks(uuid) TO anon, authenticated;
