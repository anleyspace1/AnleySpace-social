-- Optional: message kind for DM rendering (text, image, audio, story_reply, etc.)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS type TEXT;
