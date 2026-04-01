-- Add soft-delete flag for chat messages.
-- Safe additive migration: no drops/recreates.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- Backfill safety for pre-existing rows in case any nulls exist.
UPDATE public.messages
SET is_deleted = false
WHERE is_deleted IS NULL;

ALTER TABLE public.messages
  ALTER COLUMN is_deleted SET DEFAULT false;
