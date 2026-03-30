-- Withdraw requests ledger: users request manual payouts in exchange for coins.

CREATE TABLE IF NOT EXISTS public.withdraw_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payment_method text NOT NULL,
  payment_details text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdraw_requests_user_id_idx ON public.withdraw_requests (user_id);
CREATE INDEX IF NOT EXISTS withdraw_requests_created_at_idx ON public.withdraw_requests (created_at DESC);

ALTER TABLE public.withdraw_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests.
CREATE POLICY "withdraw_requests_select_own"
ON public.withdraw_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own requests.
CREATE POLICY "withdraw_requests_insert_own"
ON public.withdraw_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admin/service role can update statuses (approve/reject).
CREATE POLICY "withdraw_requests_update_service_role_only"
ON public.withdraw_requests
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

