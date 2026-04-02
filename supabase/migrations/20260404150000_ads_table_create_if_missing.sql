-- Create public.ads when missing (e.g. partial deploys). Does not alter existing ads rows or other objects.

CREATE TABLE IF NOT EXISTS public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  link_url text,
  image_url text,
  target_country text,
  target_interest text,
  target_min_age integer,
  target_max_age integer,
  budget integer,
  duration integer,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads_insert_own" ON public.ads;
CREATE POLICY "ads_insert_own"
ON public.ads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ads_select_own" ON public.ads;
CREATE POLICY "ads_select_own"
ON public.ads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
