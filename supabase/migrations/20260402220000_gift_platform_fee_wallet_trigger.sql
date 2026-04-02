-- When a gift row is inserted, credit platform_wallet with platform_coins and log transactions (same DB transaction).

CREATE OR REPLACE FUNCTION public.gift_transactions_after_insert_platform_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pw_id uuid;
  pc integer;
BEGIN
  pc := COALESCE(NEW.platform_coins, 0);
  IF pc <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_pw_id FROM public.platform_wallet LIMIT 1 FOR UPDATE;
  IF v_pw_id IS NULL THEN
    INSERT INTO public.platform_wallet (coins) VALUES (pc) RETURNING id INTO v_pw_id;
  ELSE
    UPDATE public.platform_wallet SET coins = coins + pc WHERE id = v_pw_id;
  END IF;

  INSERT INTO public.transactions (id, user_id, type, amount, description, target)
  VALUES (
    gen_random_uuid(),
    NULL,
    'earn',
    pc,
    'Platform gift fee id ' || NEW.id::text,
    'gift_platform_fee'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gift_transactions_platform_fee ON public.gift_transactions;

CREATE TRIGGER gift_transactions_platform_fee
AFTER INSERT ON public.gift_transactions
FOR EACH ROW
EXECUTE PROCEDURE public.gift_transactions_after_insert_platform_fee();

COMMENT ON FUNCTION public.gift_transactions_after_insert_platform_fee() IS
  'Credits platform_wallet from gift_transactions.platform_coins and logs transactions (earn / gift_platform_fee) in the same transaction as the gift insert.';

NOTIFY pgrst, 'reload schema';
