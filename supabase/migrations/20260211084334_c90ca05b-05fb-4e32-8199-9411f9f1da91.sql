
-- 1. Fix channel posting: enforce creator-only posting at DB level
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
CREATE POLICY "Channel creators can post"
  ON public.posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.channels
      WHERE channels.id = posts.channel_id
      AND channels.creator_id = auth.uid()
    )
  );

-- 2. Fix group messages: restrict to members only
DROP POLICY IF EXISTS "Anyone can view group messages" ON public.group_messages;
CREATE POLICY "Group members can view messages"
  ON public.group_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = group_messages.group_id
      AND group_members.user_id = auth.uid()
    )
  );

-- 3. Restrict media bucket to safe MIME types
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
WHERE id = 'media';
