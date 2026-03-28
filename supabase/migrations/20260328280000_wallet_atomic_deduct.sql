-- Atomic wallet deduction: single UPDATE with balance >= cost (no read-then-write race).

CREATE OR REPLACE FUNCTION public.deduct_wallet_if_sufficient(p_cost integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.user_wallets
  SET balance = balance - p_cost
  WHERE user_id = auth.uid()
    AND balance >= p_cost
  RETURNING balance INTO v_new;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_wallet_if_sufficient(integer) TO authenticated;

-- Add coins back atomically (boost rollback).
CREATE OR REPLACE FUNCTION public.refund_wallet_coins(p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.user_wallets
  SET balance = balance + p_amount
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_wallet_coins(integer) TO authenticated;
