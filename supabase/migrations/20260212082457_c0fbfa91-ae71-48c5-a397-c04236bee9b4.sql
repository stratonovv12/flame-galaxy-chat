
-- Make media bucket public so files are accessible
UPDATE storage.buckets SET public = true WHERE id = 'media';

-- Add public SELECT policy for media bucket
CREATE POLICY "Public media access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');
