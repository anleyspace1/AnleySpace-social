-- Support insert RLS hardening:
-- Keep scope only on support_messages and only insert policy behavior.

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_insert_own" ON public.support_messages;

CREATE POLICY "support_insert_own"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
