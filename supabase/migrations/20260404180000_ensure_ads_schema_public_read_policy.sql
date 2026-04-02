-- Idempotent: ensure public.ads has all columns the app uses + feed-visible SELECT for active/approved/non-expired ads.
-- Fixes local/prod drift when columns (e.g. ends_at, is_active) were added manually or migrations ran out of order.

-- Core columns (older migrations may have created the table without some fields)
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS target_country text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS target_interest text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS target_min_age integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS target_max_age integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS budget integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS duration integer;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Status check (skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ads_status_check' AND conrelid = 'public.ads'::regclass
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_status_check CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ads_feed_active_idx
  ON public.ads (is_active, status, ends_at DESC)
  WHERE is_active = true AND status = 'approved';

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- Authenticated users insert their own rows (Create Ad flow)
DROP POLICY IF EXISTS "ads_insert_own" ON public.ads;
CREATE POLICY "ads_insert_own"
ON public.ads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can read their own ads (any status) for dashboard / debugging
DROP POLICY IF EXISTS "ads_select_own" ON public.ads;
CREATE POLICY "ads_select_own"
ON public.ads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Feed + anon: only active, approved, not past ends_at (ends_at NULL treated as still valid for legacy rows)
DROP POLICY IF EXISTS "ads_select_active_public" ON public.ads;
CREATE POLICY "ads_select_active_public"
ON public.ads
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND status = 'approved'
  AND (ends_at IS NULL OR ends_at > now())
);

NOTIFY pgrst, 'reload schema';
