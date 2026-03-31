-- Data alignment only: keep admin logic unchanged.
-- Ensure expected admin user has profiles.role = 'admin'.

UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE email = 'anleyspace@gmail.com'
);
