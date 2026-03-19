-- Enable RLS on the posts table if not already enabled
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Drop existing select policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
DROP POLICY IF EXISTS "Allow authenticated select" ON public.posts;

-- Create a policy that allows all users to view posts
CREATE POLICY "Posts are viewable by all users" 
ON public.posts 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Also ensure comments and likes are viewable so the UI works correctly
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments are viewable by all users" 
ON public.comments 
FOR SELECT 
TO anon, authenticated 
USING (true);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
CREATE POLICY "Likes are viewable by all users" 
ON public.likes 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Ensure profiles are viewable so usernames and avatars show up
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by all users" 
ON public.profiles 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Ensure messages can be sent and viewed
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Messages are viewable by authenticated users" ON public.messages;
CREATE POLICY "Messages are viewable by all users" 
ON public.messages 
FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
CREATE POLICY "Users can insert their own messages" 
ON public.messages 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = sender_id);

-- Groups and Group Members
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Groups are viewable by all users" ON public.groups;
CREATE POLICY "Groups are viewable by all users" 
ON public.groups 
FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
CREATE POLICY "Users can create groups" 
ON public.groups 
FOR ALL 
TO anon, authenticated 
USING (true);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group members are viewable by all users" ON public.group_members;
CREATE POLICY "Group members are viewable by all users" 
ON public.group_members 
FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
CREATE POLICY "Users can join groups" 
ON public.group_members 
FOR ALL 
TO anon, authenticated 
USING (true);

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by all users" ON public.profiles;
CREATE POLICY "Profiles are viewable by all users" 
ON public.profiles 
FOR ALL 
TO anon, authenticated 
USING (true);

-- Follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Follows are viewable by all users" ON public.follows;
CREATE POLICY "Follows are viewable by all users" 
ON public.follows 
FOR ALL 
TO anon, authenticated 
USING (true);

-- Calls and Call Speakers
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Calls are viewable by all users" ON public.calls;
CREATE POLICY "Calls are viewable by all users" 
ON public.calls 
FOR ALL 
TO anon, authenticated 
USING (true);

ALTER TABLE public.call_speakers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Call speakers are viewable by all users" ON public.call_speakers;
CREATE POLICY "Call speakers are viewable by all users" 
ON public.call_speakers 
FOR ALL 
TO anon, authenticated 
USING (true);

-- Products and Orders
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Products are viewable by all users" ON public.products;
CREATE POLICY "Products are viewable by all users" 
ON public.products 
FOR ALL 
TO anon, authenticated 
USING (true);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Orders are viewable by all users" ON public.orders;
CREATE POLICY "Orders are viewable by all users" 
ON public.orders 
FOR ALL 
TO anon, authenticated 
USING (true);

-- Stories and Group Messages
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stories are viewable by all users" ON public.stories;
CREATE POLICY "Stories are viewable by all users" 
ON public.stories 
FOR ALL 
TO anon, authenticated 
USING (true);

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group messages are viewable by all users" ON public.group_messages;
CREATE POLICY "Group messages are viewable by all users" 
ON public.group_messages 
FOR ALL 
TO anon, authenticated 
USING (true);

-- Lives and Live Viewers
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lives are viewable by all users" ON public.lives;
CREATE POLICY "Lives are viewable by all users" 
ON public.lives 
FOR ALL 
TO anon, authenticated 
USING (true);

ALTER TABLE public.live_viewers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Live viewers are viewable by all users" ON public.live_viewers;
CREATE POLICY "Live viewers are viewable by all users" 
ON public.live_viewers 
FOR ALL 
TO anon, authenticated 
USING (true);

-- Transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Transactions are viewable by all users" ON public.transactions;
CREATE POLICY "Transactions are viewable by all users" 
ON public.transactions 
FOR ALL 
TO anon, authenticated 
USING (true);
