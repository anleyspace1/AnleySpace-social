-- Atomic withdraw processing: deduct coins + create withdraw request in one transaction.

CREATE OR REPLACE FUNCTION public.process_withdraw(
  p_user_id uuid,
  p_coins integer,
  p_method text,
  p_details text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_coins integer;
BEGIN
  IF p_user_id IS NULL OR p_coins IS NULL OR p_coins <= 0 THEN
    RAISE EXCEPTION 'Invalid withdraw input';
  END IF;

  -- Prevent users from attempting RPC on behalf of someone else.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT coins
    INTO current_coins
  FROM public.profiles
  WHERE id = p_user_id;

  IF current_coins IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF current_coins < p_coins THEN
    RAISE EXCEPTION 'Not enough coins';
  END IF;

  UPDATE public.profiles
  SET coins = coins - p_coins
  WHERE id = p_user_id;

  INSERT INTO public.withdraw_requests (user_id, coins, payment_method, payment_details)
  VALUES (p_user_id, p_coins, p_method, p_details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_withdraw(uuid, integer, text, text) TO authenticated;

