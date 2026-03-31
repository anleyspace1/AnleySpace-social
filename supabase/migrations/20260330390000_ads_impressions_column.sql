ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0;
