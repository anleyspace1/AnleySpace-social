-- Ensure profiles.username is never NULL (server id-only upserts and legacy rows).
-- Note: PostgreSQL does not allow DEFAULT expressions that reference other columns (e.g. id),
-- so we use a BEFORE INSERT/UPDATE trigger instead of ALTER COLUMN ... SET DEFAULT (...).

UPDATE public.profiles
SET username = 'user_' || substr(id::text, 1, 6)
WHERE username IS NULL OR trim(username) = '';

CREATE OR REPLACE FUNCTION public.profiles_ensure_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.username IS NULL OR length(trim(NEW.username)) = 0 THEN
    NEW.username := 'user_' || substr(NEW.id::text, 1, 6);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_ensure_username_trigger ON public.profiles;
CREATE TRIGGER profiles_ensure_username_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_ensure_username();

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;
