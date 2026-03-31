CREATE TABLE IF NOT EXISTS public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  image_url text NOT NULL,
  link_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ads_is_active_idx ON public.ads (is_active);
CREATE INDEX IF NOT EXISTS ads_created_at_idx ON public.ads (created_at DESC);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads_select_active_public" ON public.ads;
CREATE POLICY "ads_select_active_public"
ON public.ads
FOR SELECT
TO anon, authenticated
USING (is_active = true);
