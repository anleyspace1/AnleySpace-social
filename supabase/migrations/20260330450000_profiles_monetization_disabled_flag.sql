ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monetization_disabled boolean NOT NULL DEFAULT false;
