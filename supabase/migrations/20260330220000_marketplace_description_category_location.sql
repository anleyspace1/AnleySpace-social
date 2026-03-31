-- Add listing columns required by the app insert (Vercel / Supabase client).
-- Idempotent: safe to run multiple times. Does not drop or alter existing columns.

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.marketplace
  ADD COLUMN IF NOT EXISTS location text;
