-- Make user_roles readable by all authenticated users (for badges visibility)
CREATE POLICY "Authenticated can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (true);

-- Make verified_users readable by everyone (already has policy but ensure it works)
-- Already has "Anyone can read verified" with USING (true) - OK

-- Make verified_channels readable by all authenticated (already exists) - OK