-- Add delete-for-me support to messages.
-- Safe additive migration (no drops/recreates).

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_for uuid[] DEFAULT '{}'::uuid[];

-- Backfill nulls to empty array for safe frontend reads.
UPDATE public.messages
SET deleted_for = '{}'::uuid[]
WHERE deleted_for IS NULL;

ALTER TABLE public.messages
  ALTER COLUMN deleted_for SET DEFAULT '{}'::uuid[];
