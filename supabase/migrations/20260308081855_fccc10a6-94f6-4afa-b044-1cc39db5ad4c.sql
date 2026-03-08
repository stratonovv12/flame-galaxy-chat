
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS inventory_visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.user_inventory ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Allow anyone authenticated to view inventory items that are public
CREATE POLICY "Anyone can view public inventory items"
ON public.user_inventory FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND is_hidden = false
  AND (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = user_inventory.owner_id AND inventory_visibility = 'public'
    )
  )
);

-- Drop the old owner-only select policy
DROP POLICY IF EXISTS "Users can view own inventory" ON public.user_inventory;
