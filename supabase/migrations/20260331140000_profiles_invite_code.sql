-- Public referral code on profiles (matches InviteEarnPage: first 8 chars of UUID, uppercased).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_code text;

UPDATE public.profiles
SET invite_code = upper(substring(id::text, 1, 8))
WHERE invite_code IS NULL OR trim(invite_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_code_key ON public.profiles (invite_code);
