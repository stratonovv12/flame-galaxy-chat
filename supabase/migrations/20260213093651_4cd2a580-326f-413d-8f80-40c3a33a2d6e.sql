
-- 1. Fix message_reactions: restrict to authenticated users only
DROP POLICY IF EXISTS "Anyone can view reactions" ON public.message_reactions;
CREATE POLICY "Authenticated users can view reactions"
  ON public.message_reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 2. Fix user_roles: restrict to authenticated users viewing their own roles only
DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Allow has_role() function to still work (it's SECURITY DEFINER so bypasses RLS)

-- 3. Fix verified_channels: restrict to authenticated, create view to hide verified_by
DROP POLICY IF EXISTS "Anyone can view verified channels" ON public.verified_channels;
CREATE POLICY "Authenticated can view verified channels"
  ON public.verified_channels FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. Fix verified_groups: same treatment
DROP POLICY IF EXISTS "Anyone can view verified groups" ON public.verified_groups;
CREATE POLICY "Authenticated can view verified groups"
  ON public.verified_groups FOR SELECT
  USING (auth.uid() IS NOT NULL);
