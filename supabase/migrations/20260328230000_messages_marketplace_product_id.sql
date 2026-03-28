-- Optional marketplace listing id on DM rows: separates threads per product for the same two users.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS product_id uuid NULL;

CREATE INDEX IF NOT EXISTS messages_dm_product_id_idx
  ON public.messages (sender_id, receiver_id, product_id)
  WHERE group_id IS NULL;
