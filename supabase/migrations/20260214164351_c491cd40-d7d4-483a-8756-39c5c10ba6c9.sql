
-- 1. Allow receivers to update read_at on direct_messages (CRITICAL: this is why "mark as read" fails)
CREATE POLICY "Receivers can mark messages as read"
ON public.direct_messages
FOR UPDATE
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

-- 2. Allow group creators and admins to kick members
CREATE POLICY "Creators and admins can remove members"
ON public.group_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.groups WHERE groups.id = group_members.group_id AND groups.creator_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.group_admins WHERE group_admins.group_id = group_members.group_id AND group_admins.user_id = auth.uid()
  )
);

-- 3. Allow group creators and admins to delete any message in their group
CREATE POLICY "Creators and admins can delete group messages"
ON public.group_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.groups WHERE groups.id = group_messages.group_id AND groups.creator_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.group_admins WHERE group_admins.group_id = group_messages.group_id AND group_admins.user_id = auth.uid()
  )
);

-- 4. Allow channel creators and admins to delete posts
CREATE POLICY "Channel admins can delete posts"
ON public.posts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.channels WHERE channels.id = posts.channel_id AND channels.creator_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.channel_admins WHERE channel_admins.channel_id = posts.channel_id AND channel_admins.user_id = auth.uid()
  )
);
