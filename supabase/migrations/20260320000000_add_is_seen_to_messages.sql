-- Delivered / Seen for direct messages (WhatsApp-style).
-- Run via Supabase CLI or SQL Editor.

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS is_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.messages.is_seen IS 'True when the receiver has opened the chat and this message was marked read (sender sees Seen).';

-- If RLS blocks UPDATE for the receiver, add a policy e.g.:
-- CREATE POLICY "messages_mark_seen" ON public.messages FOR UPDATE TO authenticated
-- USING (receiver_id = auth.uid()) WITH CHECK (receiver_id = auth.uid());
