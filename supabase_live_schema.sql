-- Live Streaming Tables
CREATE TABLE IF NOT EXISTS public.lives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  channel_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  viewer_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.live_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  live_id UUID REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.live_viewers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  live_id UUID REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(live_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  live_id UUID REFERENCES public.lives(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  receiver_id UUID REFERENCES auth.users(id),
  coins INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_gifts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Lives are viewable by everyone" ON public.lives FOR SELECT USING (true);
CREATE POLICY "Users can start lives" ON public.lives FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Hosts can update their lives" ON public.lives FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Live messages are viewable by everyone" ON public.live_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send live messages" ON public.live_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Live viewers are viewable by everyone" ON public.live_viewers FOR SELECT USING (true);
CREATE POLICY "Authenticated users can join live" ON public.live_viewers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave live" ON public.live_viewers FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Live gifts are viewable by everyone" ON public.live_gifts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send gifts" ON public.live_gifts FOR INSERT WITH CHECK (auth.uid() = sender_id);
