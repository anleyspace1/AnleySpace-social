-- Optional: run in Supabase SQL editor if `messages` does not yet have story reply columns.
-- Safe to run once; uses IF NOT EXISTS pattern where supported.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS story_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS story_media TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS story_media_type TEXT;
