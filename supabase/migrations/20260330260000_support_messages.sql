CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_resolved boolean NOT NULL DEFAULT false
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can send support messages" ON public.support_messages;
CREATE POLICY "Users can send support messages"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own support messages" ON public.support_messages;
CREATE POLICY "Users can read own support messages"
ON public.support_messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can read all support messages" ON public.support_messages;
CREATE POLICY "Admin can read all support messages"
ON public.support_messages
FOR SELECT
TO authenticated
USING (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);
