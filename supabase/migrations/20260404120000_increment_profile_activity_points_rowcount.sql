-- increment_profile_activity_points: return number of rows updated so API can detect silent 0-row
-- UPDATEs (missing profiles row, UUID mismatch). void return hides this in PostgREST.

DROP FUNCTION IF EXISTS public.increment_profile_activity_points(uuid, bigint);

CREATE FUNCTION public.increment_profile_activity_points(p_user_id uuid, p_delta bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF p_user_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.profiles
  SET
    gift_points = COALESCE(gift_points, 0) + p_delta,
    points = COALESCE(points, 0) + p_delta
  WHERE id = p_user_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.increment_profile_activity_points(uuid, bigint) IS
  'Adds p_delta to profiles.gift_points and profiles.points. Returns ROW_COUNT (0 if no matching profiles.id).';

REVOKE ALL ON FUNCTION public.increment_profile_activity_points(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_profile_activity_points(uuid, bigint) TO service_role;
