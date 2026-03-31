ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS target_country text;

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS target_interest text;

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS target_min_age integer;

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS target_max_age integer;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests text[];

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer;
