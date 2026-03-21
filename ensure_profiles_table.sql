CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT
);

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;
