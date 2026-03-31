ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by uuid;

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid,
  referred_user_id uuid,
  action text,
  coins integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE (referred_user_id, action)
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own referral reward logs" ON public.referral_rewards;
CREATE POLICY "Users can insert own referral reward logs"
ON public.referral_rewards
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = referred_user_id);

DROP POLICY IF EXISTS "Users can read own referral reward logs" ON public.referral_rewards;
CREATE POLICY "Users can read own referral reward logs"
ON public.referral_rewards
FOR SELECT
TO authenticated
USING (auth.uid() = referred_user_id OR auth.uid() = inviter_id);

CREATE OR REPLACE FUNCTION public.increment_user_coins(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_user_coins(uuid, integer) TO authenticated;
