-- Rewards schema repair (idempotent).
-- Fixes drift where profiles.gift_points and/or gift_transactions may be missing,
-- and re-creates increment_profile_activity_points with row-count return.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS points bigint NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gift_points bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins > 0),
  creator_coins integer NOT NULL,
  platform_coins integer NOT NULL,
  pool_coins integer NOT NULL,
  points_to_sender integer NOT NULL DEFAULT 0,
  boost_cents_applied integer NOT NULL DEFAULT 0,
  organic_cents_applied integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'reversed')),
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gift_transactions
  ADD COLUMN IF NOT EXISTS gift_type text NOT NULL DEFAULT 'gift';

CREATE INDEX IF NOT EXISTS gift_transactions_post_idx ON public.gift_transactions (post_id);
CREATE INDEX IF NOT EXISTS gift_transactions_sender_idx ON public.gift_transactions (sender_id);
CREATE INDEX IF NOT EXISTS gift_transactions_creator_idx ON public.gift_transactions (creator_id);

ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gift_transactions_select_parties" ON public.gift_transactions;
CREATE POLICY "gift_transactions_select_parties"
ON public.gift_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = creator_id);

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

-- Ask PostgREST to reload schema cache so newly created/altered relations are visible immediately.
NOTIFY pgrst, 'reload schema';
