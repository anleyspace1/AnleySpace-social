-- Boost success audit: coins spent (additive).
ALTER TABLE public.wallet_events ADD COLUMN IF NOT EXISTS amount integer;
