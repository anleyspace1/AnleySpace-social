-- Idempotent Stripe credits: one row per Checkout Session so retries / duplicate webhooks cannot double-credit.
-- credit_wallet_coins gains optional p_stripe_session_id; when set, insert ledger first — skip wallet/profile updates if session already applied.

CREATE TABLE IF NOT EXISTS public.stripe_checkout_credits_applied (
  stripe_session_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  coin_amount integer NOT NULL CHECK (coin_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_checkout_credits_applied_user_id_idx
  ON public.stripe_checkout_credits_applied (user_id);

ALTER TABLE public.stripe_checkout_credits_applied ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated; service_role bypasses RLS for webhook RPC.

CREATE OR REPLACE FUNCTION public.credit_wallet_coins(
  p_user_id uuid,
  p_amount integer,
  p_stripe_session_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_ledger integer;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  IF p_stripe_session_id IS NOT NULL AND length(trim(p_stripe_session_id)) > 0 THEN
    INSERT INTO public.stripe_checkout_credits_applied (stripe_session_id, user_id, coin_amount)
    VALUES (trim(p_stripe_session_id), p_user_id, p_amount)
    ON CONFLICT (stripe_session_id) DO NOTHING;
    GET DIAGNOSTICS inserted_ledger = ROW_COUNT;
    IF inserted_ledger = 0 THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.user_wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.user_wallets.balance + EXCLUDED.balance;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_coins(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet_coins(uuid, integer, text) TO service_role;

-- Keep 2-arg overload for older callers (no idempotency).
CREATE OR REPLACE FUNCTION public.credit_wallet_coins(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.credit_wallet_coins(p_user_id, p_amount, NULL::text);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_coins(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet_coins(uuid, integer) TO service_role;
