-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Create channels table
CREATE TABLE public.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- Channels policies
CREATE POLICY "Anyone can view channels"
    ON public.channels FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can create channels"
    ON public.channels FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can delete own channels"
    ON public.channels FOR DELETE
    TO authenticated
    USING (auth.uid() = creator_id);

-- Create posts table
CREATE TABLE public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Posts policies
CREATE POLICY "Anyone can view posts"
    ON public.posts FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can create posts"
    ON public.posts FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete own posts"
    ON public.posts FOR DELETE
    TO authenticated
    USING (auth.uid() = author_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for profiles
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;