-- Platform wallet: accumulates coins from user spend flows (boost, ads, etc.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    CREATE TABLE public.transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      amount integer,
      type text,
      description text,
      target text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS target text;

CREATE TABLE IF NOT EXISTS public.platform_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coins integer NOT NULL DEFAULT 0
);

INSERT INTO public.platform_wallet (coins)
SELECT 0
WHERE NOT EXISTS (SELECT 1 FROM public.platform_wallet LIMIT 1);

ALTER TABLE public.platform_wallet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_wallet_admin_select" ON public.platform_wallet;
CREATE POLICY "platform_wallet_admin_select"
ON public.platform_wallet
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Atomic: deduct user, credit platform, log transaction
CREATE OR REPLACE FUNCTION public.platform_spend_coins(
  p_user_id uuid,
  p_amount integer,
  p_target text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance int;
  v_pw_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_target IS NULL OR p_target NOT IN ('boost', 'ads') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) - p_amount
  WHERE id = p_user_id AND COALESCE(coins, 0) >= p_amount
  RETURNING coins INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_coins');
  END IF;

  SELECT id INTO v_pw_id FROM public.platform_wallet LIMIT 1 FOR UPDATE;
  IF v_pw_id IS NULL THEN
    INSERT INTO public.platform_wallet (coins) VALUES (p_amount) RETURNING id INTO v_pw_id;
  ELSE
    UPDATE public.platform_wallet SET coins = coins + p_amount WHERE id = v_pw_id;
  END IF;

  INSERT INTO public.transactions (id, user_id, type, amount, description, target)
  VALUES (
    gen_random_uuid(),
    p_user_id,
    'spend',
    p_amount,
    'Platform spend: ' || p_target,
    p_target
  );

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_spend_coins(uuid, integer, text) TO authenticated;

-- Refund platform pool when a spend is reverted client-side (e.g. boost/ad insert failed after deduct)
CREATE OR REPLACE FUNCTION public.revert_platform_spend(p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;
  SELECT id INTO v_id FROM public.platform_wallet LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.platform_wallet
  SET coins = GREATEST(0, coins - p_amount)
  WHERE id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_platform_spend(integer) TO authenticated;
