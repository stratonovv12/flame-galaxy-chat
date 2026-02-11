
-- 1. Add UPDATE policy for channels
CREATE POLICY "Creators can update channels"
  ON public.channels FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- 2. Restrict channel_subscribers SELECT to own subscriptions
DROP POLICY IF EXISTS "Anyone can view subscribers" ON public.channel_subscribers;
CREATE POLICY "Users can view own subscriptions"
  ON public.channel_subscribers FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Make media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'media';

-- Update media read policy to require authentication
DROP POLICY IF EXISTS "Public media read" ON storage.objects;
CREATE POLICY "Authenticated users can view media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND auth.uid() IS NOT NULL);
