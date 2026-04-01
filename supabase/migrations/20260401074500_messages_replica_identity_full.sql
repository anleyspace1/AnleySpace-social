-- Ensure realtime UPDATE payloads include full row values for messages.
-- This helps propagate is_deleted correctly to subscribers.

ALTER TABLE public.messages REPLICA IDENTITY FULL;
