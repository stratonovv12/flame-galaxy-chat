
-- 1. Group/Channel admin roles
CREATE TABLE public.group_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  appointed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view admins" ON public.group_admins
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Group creator can manage admins" ON public.group_admins
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND creator_id = auth.uid())
  );

CREATE TABLE public.channel_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  appointed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.channel_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view channel admins" ON public.channel_admins
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Channel creator can manage admins" ON public.channel_admins
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.channels WHERE id = channel_id AND creator_id = auth.uid())
  );

-- 2. Verified channels & groups (for super-admin)
CREATE TABLE public.verified_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL UNIQUE REFERENCES public.channels(id) ON DELETE CASCADE,
  verified_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.verified_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view verified channels" ON public.verified_channels
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage verified channels" ON public.verified_channels
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.verified_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
  verified_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.verified_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view verified groups" ON public.verified_groups
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage verified groups" ON public.verified_groups
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 3. Calls signaling table
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'rejected')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their calls" ON public.calls
  FOR SELECT USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create calls" ON public.calls
  FOR INSERT WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Participants can update calls" ON public.calls
  FOR UPDATE USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;

-- 4. User presence table for online/offline status
CREATE TABLE public.user_presence (
  user_id UUID PRIMARY KEY,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_online BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view presence" ON public.user_presence
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can upsert own presence" ON public.user_presence
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence" ON public.user_presence
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. Allow super-admin to delete any group/channel
CREATE POLICY "Admins can delete any group" ON public.groups
  FOR DELETE USING (public.has_role(auth.uid(), 'admin') OR creator_id = auth.uid());

CREATE POLICY "Admins can delete any channel" ON public.channels
  FOR DELETE USING (public.has_role(auth.uid(), 'admin') OR creator_id = auth.uid());

-- 6. Allow group creator to update their group (for ownership transfer)
CREATE POLICY "Creator can update group" ON public.groups
  FOR UPDATE USING (creator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creator can update channel" ON public.channels
  FOR UPDATE USING (creator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
