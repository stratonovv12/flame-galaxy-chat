
-- Add steam_trade_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS steam_trade_url text DEFAULT NULL;

-- Wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric(12,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wallet" ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wallet" ON public.wallets FOR UPDATE USING (auth.uid() = user_id);

-- Marketplace listings
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  price numeric(12,2) NOT NULL,
  category text DEFAULT 'skin',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active listings" ON public.marketplace_listings FOR SELECT USING (true);
CREATE POLICY "Users can create listings" ON public.marketplace_listings FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can update own listings" ON public.marketplace_listings FOR UPDATE USING (auth.uid() = seller_id);
CREATE POLICY "Sellers can delete own listings" ON public.marketplace_listings FOR DELETE USING (auth.uid() = seller_id);

-- Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.marketplace_listings(id),
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  commission numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Users can create transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- Buy listing function with 5% commission
CREATE OR REPLACE FUNCTION public.buy_listing(_listing_id uuid, _buyer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _listing marketplace_listings%ROWTYPE;
  _buyer_balance numeric;
  _commission numeric;
  _seller_amount numeric;
BEGIN
  SELECT * INTO _listing FROM marketplace_listings WHERE id = _listing_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Товар не найден или уже продан'); END IF;
  IF _listing.seller_id = _buyer_id THEN RETURN jsonb_build_object('error', 'Нельзя купить свой товар'); END IF;

  SELECT balance INTO _buyer_balance FROM wallets WHERE user_id = _buyer_id FOR UPDATE;
  IF _buyer_balance IS NULL THEN RETURN jsonb_build_object('error', 'Кошелёк не найден'); END IF;
  IF _buyer_balance < _listing.price THEN RETURN jsonb_build_object('error', 'Недостаточно средств'); END IF;

  _commission := ROUND(_listing.price * 0.05, 2);
  _seller_amount := _listing.price - _commission;

  UPDATE wallets SET balance = balance - _listing.price, updated_at = now() WHERE user_id = _buyer_id;
  
  INSERT INTO wallets (user_id, balance) VALUES (_listing.seller_id, _seller_amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + _seller_amount, updated_at = now();

  INSERT INTO wallets (user_id, balance) 
  VALUES ((SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1), _commission)
  ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + _commission, updated_at = now();

  UPDATE marketplace_listings SET status = 'sold' WHERE id = _listing_id;

  INSERT INTO transactions (listing_id, buyer_id, seller_id, amount, commission, status)
  VALUES (_listing_id, _buyer_id, _listing.seller_id, _listing.price, _commission, 'completed');

  RETURN jsonb_build_object('success', true, 'commission', _commission, 'total', _listing.price);
END;
$$;
