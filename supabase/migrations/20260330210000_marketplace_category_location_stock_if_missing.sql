-- Repair: production may be missing listing columns the app inserts (see marketplaceRemote insert).
-- Idempotent — safe to run multiple times (IF NOT EXISTS). Does not drop or alter existing columns.

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS stock integer;
