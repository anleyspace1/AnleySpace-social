-- Optional listing metadata (additive). Synced from app when present.

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS stock integer;
