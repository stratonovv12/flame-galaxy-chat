-- 1. Stickers
CREATE TABLE public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  emoji text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stickers TO authenticated;
GRANT SELECT ON public.stickers TO anon;
GRANT ALL ON public.stickers TO service_role;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stickers are viewable by everyone" ON public.stickers FOR SELECT USING (true);
CREATE POLICY "Users insert own stickers" ON public.stickers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own stickers" ON public.stickers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. Profile items (rich presentations / texts / media)
CREATE TABLE public.profile_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'presentation',
  title text,
  content text NOT NULL DEFAULT '',
  media_url text,
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_items TO authenticated;
GRANT SELECT ON public.profile_items TO anon;
GRANT ALL ON public.profile_items TO service_role;
ALTER TABLE public.profile_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profile items are viewable" ON public.profile_items FOR SELECT USING (archived = false OR auth.uid() = user_id);
CREATE POLICY "Users insert own profile items" ON public.profile_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile items" ON public.profile_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own profile items" ON public.profile_items FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_profile_items_updated_at BEFORE UPDATE ON public.profile_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Phone verification + privacy on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_public boolean NOT NULL DEFAULT false;

-- 4. Device-based account registrations (multi-account limit)
CREATE TABLE public.account_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, user_id)
);
GRANT SELECT, INSERT ON public.account_registrations TO authenticated;
GRANT SELECT ON public.account_registrations TO anon;
GRANT ALL ON public.account_registrations TO service_role;
ALTER TABLE public.account_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can count registrations" ON public.account_registrations FOR SELECT USING (true);
CREATE POLICY "Users record own registration" ON public.account_registrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 5. Mini-app official verified badge
ALTER TABLE public.mini_apps ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

-- 6. Figurines (admin-minted collectibles)
CREATE TABLE public.figurines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  rarity text NOT NULL DEFAULT 'common',
  supply integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.figurines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.figurines TO authenticated;
GRANT ALL ON public.figurines TO service_role;
ALTER TABLE public.figurines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Figurines viewable by everyone" ON public.figurines FOR SELECT USING (true);
CREATE POLICY "Admins mint figurines" ON public.figurines FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update figurines" ON public.figurines FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete figurines" ON public.figurines FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_figurines_updated_at BEFORE UPDATE ON public.figurines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Ownership
CREATE TABLE public.figurine_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  figurine_id uuid NOT NULL REFERENCES public.figurines(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  serial integer NOT NULL DEFAULT 1,
  showcased boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.figurine_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.figurine_items TO authenticated;
GRANT ALL ON public.figurine_items TO service_role;
ALTER TABLE public.figurine_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owned figurines viewable by everyone" ON public.figurine_items FOR SELECT USING (true);
CREATE POLICY "Admins grant figurines" ON public.figurine_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = owner_id);
CREATE POLICY "Owners transfer their figurines" ON public.figurine_items FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete figurine items" ON public.figurine_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_figurine_items_updated_at BEFORE UPDATE ON public.figurine_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Marketplace listings
CREATE TABLE public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.figurine_items(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  price numeric NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketplace_listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listings viewable by everyone" ON public.marketplace_listings FOR SELECT USING (true);
CREATE POLICY "Sellers create listings" ON public.marketplace_listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers update own listings" ON public.marketplace_listings FOR UPDATE TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "Sellers delete own listings" ON public.marketplace_listings FOR DELETE TO authenticated USING (auth.uid() = seller_id);
CREATE TRIGGER update_marketplace_listings_updated_at BEFORE UPDATE ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Escrow orders
CREATE TABLE public.escrow_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'held',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.escrow_orders TO authenticated;
GRANT ALL ON public.escrow_orders TO service_role;
ALTER TABLE public.escrow_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view their orders" ON public.escrow_orders FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Buyers create orders" ON public.escrow_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Participants update their orders" ON public.escrow_orders FOR UPDATE TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_escrow_orders_updated_at BEFORE UPDATE ON public.escrow_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();