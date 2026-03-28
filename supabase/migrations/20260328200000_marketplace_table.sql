-- New table only: marketplace (does not alter existing tables).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.marketplace (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  price numeric NOT NULL,
  image_url text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace ENABLE ROW LEVEL SECURITY;

-- Public read (anon + authenticated)
CREATE POLICY "Allow public read access to marketplace"
ON public.marketplace
FOR SELECT
USING (true);

-- Authenticated users can insert
CREATE POLICY "Allow authenticated insert to marketplace"
ON public.marketplace
FOR INSERT
TO authenticated
WITH CHECK (true);
