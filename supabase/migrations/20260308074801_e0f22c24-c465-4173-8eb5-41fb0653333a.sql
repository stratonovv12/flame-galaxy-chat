
-- User inventory: items purchased or received
CREATE TABLE public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  image_url text,
  acquired_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory" ON public.user_inventory
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own inventory" ON public.user_inventory
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own inventory" ON public.user_inventory
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own inventory" ON public.user_inventory
  FOR DELETE USING (auth.uid() = owner_id);

-- Trade offers
CREATE TABLE public.trade_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  sender_item_id uuid REFERENCES public.user_inventory(id) ON DELETE CASCADE,
  receiver_item_id uuid REFERENCES public.user_inventory(id) ON DELETE CASCADE,
  sender_balance_offer numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trade offers" ON public.trade_offers
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create trade offers" ON public.trade_offers
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Participants can update trade offers" ON public.trade_offers
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Deposit/withdrawal requests
CREATE TABLE public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'deposit',
  wallet_address text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deposit requests" ON public.deposit_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create deposit requests" ON public.deposit_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Gift function: transfer inventory item
CREATE OR REPLACE FUNCTION public.gift_item(_item_id uuid, _from_user uuid, _to_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _to_user uuid;
  _item user_inventory%ROWTYPE;
BEGIN
  SELECT user_id INTO _to_user FROM profiles WHERE username = _to_username LIMIT 1;
  IF _to_user IS NULL THEN RETURN jsonb_build_object('error', 'Пользователь не найден'); END IF;
  IF _to_user = _from_user THEN RETURN jsonb_build_object('error', 'Нельзя подарить себе'); END IF;

  SELECT * INTO _item FROM user_inventory WHERE id = _item_id AND owner_id = _from_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Предмет не найден'); END IF;

  UPDATE user_inventory SET owner_id = _to_user WHERE id = _item_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Accept trade offer function
CREATE OR REPLACE FUNCTION public.accept_trade(_offer_id uuid, _accepter uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _offer trade_offers%ROWTYPE;
  _accepter_balance numeric;
BEGIN
  SELECT * INTO _offer FROM trade_offers WHERE id = _offer_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Предложение не найдено'); END IF;
  IF _offer.receiver_id != _accepter THEN RETURN jsonb_build_object('error', 'Нет доступа'); END IF;

  -- Handle balance transfer
  IF _offer.sender_balance_offer > 0 THEN
    SELECT balance INTO _accepter_balance FROM wallets WHERE user_id = _offer.sender_id FOR UPDATE;
    IF _accepter_balance IS NULL OR _accepter_balance < _offer.sender_balance_offer THEN
      RETURN jsonb_build_object('error', 'У отправителя недостаточно средств');
    END IF;
    UPDATE wallets SET balance = balance - _offer.sender_balance_offer WHERE user_id = _offer.sender_id;
    INSERT INTO wallets (user_id, balance) VALUES (_accepter, _offer.sender_balance_offer)
      ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + _offer.sender_balance_offer;
  END IF;

  -- Swap items
  IF _offer.sender_item_id IS NOT NULL THEN
    UPDATE user_inventory SET owner_id = _offer.receiver_id WHERE id = _offer.sender_item_id;
  END IF;
  IF _offer.receiver_item_id IS NOT NULL THEN
    UPDATE user_inventory SET owner_id = _offer.sender_id WHERE id = _offer.receiver_item_id;
  END IF;

  UPDATE trade_offers SET status = 'accepted', updated_at = now() WHERE id = _offer_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Auto-add purchased items to inventory (update buy_listing)
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
  _steam_url text;
BEGIN
  -- Check Steam trade URL
  SELECT steam_trade_url INTO _steam_url FROM profiles WHERE user_id = _buyer_id;
  IF _steam_url IS NULL OR _steam_url = '' THEN
    RETURN jsonb_build_object('error', 'Укажите Steam Trade URL в профиле');
  END IF;

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

  -- Add to buyer inventory
  INSERT INTO user_inventory (owner_id, listing_id, title, description, image_url)
  VALUES (_buyer_id, _listing_id, _listing.title, _listing.description, _listing.image_url);

  RETURN jsonb_build_object('success', true, 'commission', _commission, 'total', _listing.price);
END;
$$;
