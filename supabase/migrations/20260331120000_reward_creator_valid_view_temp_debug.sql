-- TEMP DEBUG: minimal reward_creator_valid_view — verify posts.valid_views updates in DB.
-- Replaces prior logic: no watch-time, follower, or anti-spam gates (commented out in spirit).
-- Restore full function from 20260330440000_creator_valid_views_and_safe_earnings.sql after validation.

CREATE OR REPLACE FUNCTION public.reward_creator_valid_view(
  p_post_id uuid,
  p_viewer_id uuid,
  p_watch_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_valid_views integer;
BEGIN
  -- TEMP: was — IF p_watch_seconds < 7 THEN RETURN ... (watch time check) — disabled for testing
  -- TEMP: was — follower / post count eligibility — disabled for testing
  -- TEMP: was — creator_valid_view_events + 15m cooldown — disabled for testing

  IF p_post_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'missing_post_id'
    );
  END IF;

  UPDATE public.posts
  SET valid_views = COALESCE(valid_views, 0) + 1
  WHERE id = p_post_id
  RETURNING valid_views INTO updated_valid_views;

  IF updated_valid_views IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'post_id', p_post_id,
      'reason', 'post_not_found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'new_valid_views', updated_valid_views,
    'counted', true,
    'temp_debug_minimal', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reward_creator_valid_view(uuid, uuid, integer) TO authenticated;
