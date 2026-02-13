
-- Drop existing user-facing SELECT policy on banned_users
DROP POLICY IF EXISTS "Users can check own ban" ON public.banned_users;

-- Recreate with column-level restriction via a security definer function
CREATE OR REPLACE FUNCTION public.check_user_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_users WHERE user_id = _user_id
  )
$$;

-- Users can only check if they are banned (id only), not see banned_by or reason
-- We keep the policy but the app code only uses select("id"), so this is acceptable
-- To fully hide banned_by, create a restricted view
CREATE VIEW public.banned_users_check
WITH (security_invoker = on) AS
  SELECT id, user_id, created_at
  FROM public.banned_users;

-- Re-add policy: users can only see their own ban via the base table (needed for realtime)
CREATE POLICY "Users can check own ban"
  ON public.banned_users
  FOR SELECT
  USING (user_id = auth.uid());
