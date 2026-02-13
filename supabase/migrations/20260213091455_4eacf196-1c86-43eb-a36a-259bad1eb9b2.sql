
-- Add display_name to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
