
-- Create banned_users table
CREATE TABLE IF NOT EXISTS public.banned_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  banned_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bans"
  ON public.banned_users FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can check own ban"
  ON public.banned_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create verified_users table
CREATE TABLE IF NOT EXISTS public.verified_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  verified_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.verified_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read verified"
  ON public.verified_users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage verified"
  ON public.verified_users FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix delete policies for DMs and group_messages
DROP POLICY IF EXISTS "Users can delete own messages" ON public.direct_messages;
DROP POLICY IF EXISTS "Users can delete own sent messages" ON public.direct_messages;
CREATE POLICY "Users can delete own sent messages"
  ON public.direct_messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own group messages" ON public.group_messages;
DROP POLICY IF EXISTS "Authors can delete own group messages" ON public.group_messages;
CREATE POLICY "Authors can delete own group messages"
  ON public.group_messages FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.banned_users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.verified_users;
