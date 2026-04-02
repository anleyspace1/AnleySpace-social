-- Rewards / monetization: keep profiles.points in sync with gift_points for activity totals.
-- Increment both in one place (service role) so tips, boosts, and coin purchases update the dashboard.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS points bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_profile_activity_points(p_user_id uuid, p_delta bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    gift_points = COALESCE(gift_points, 0) + p_delta,
    points = COALESCE(points, 0) + p_delta
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_profile_activity_points(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_profile_activity_points(uuid, bigint) TO service_role;
