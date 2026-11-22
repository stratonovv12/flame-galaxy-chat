REVOKE INSERT, UPDATE, DELETE ON public.wallets, public.figurine_items, public.marketplace_listings, public.escrow_orders FROM authenticated;
GRANT SELECT ON public.wallets, public.figurine_items, public.marketplace_listings, public.escrow_orders TO authenticated;
CREATE OR REPLACE FUNCTION public.market_action(_action text, _id uuid, _recipient text DEFAULT NULL, _price numeric DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid := auth.uid(); f public.figurines%ROWTYPE; i public.figurine_items%ROWTYPE; l public.marketplace_listings%ROWTYPE; o public.escrow_orders%ROWTYPE; target uuid; result uuid; serial_no integer; balance_now numeric; admin_id uuid; fee numeric;
BEGIN
 IF u IS NULL OR public.check_user_banned(u) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _action='buy_catalog' THEN
  SELECT * INTO f FROM public.figurines WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR f.price<0 THEN RAISE EXCEPTION 'Collectible unavailable'; END IF;
  SELECT COALESCE(max(serial),0)+1 INTO serial_no FROM public.figurine_items WHERE figurine_id=f.id;
  IF serial_no>f.supply THEN RAISE EXCEPTION 'Sold out'; END IF;
  SELECT balance INTO balance_now FROM public.wallets WHERE user_id=u FOR UPDATE;
  IF balance_now IS NULL OR balance_now<f.price THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE public.wallets SET balance=balance-f.price WHERE user_id=u;
  INSERT INTO public.figurine_items(figurine_id,owner_id,serial) VALUES(f.id,u,serial_no) RETURNING id INTO result;
  UPDATE public.wallets SET balance=balance+f.price WHERE user_id=f.created_by;
  RETURN result;
 ELSIF _action='list' THEN
  SELECT * INTO i FROM public.figurine_items WHERE id=_id AND owner_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your collectible'; END IF;
  IF _price IS NULL OR _price<=0 THEN RAISE EXCEPTION 'Invalid price'; END IF;
  IF EXISTS(SELECT 1 FROM public.marketplace_listings WHERE item_id=i.id AND status IN ('active','reserved')) THEN RAISE EXCEPTION 'Already listed'; END IF;
  INSERT INTO public.marketplace_listings(item_id,seller_id,price) VALUES(i.id,u,_price) RETURNING id INTO result; RETURN result;
 ELSIF _action='showcase' THEN
  UPDATE public.figurine_items SET showcased=NOT showcased WHERE id=_id AND owner_id=u RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Not your collectible'; END IF; RETURN result;
 ELSIF _action='gift' THEN
  SELECT * INTO i FROM public.figurine_items WHERE id=_id AND owner_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your collectible'; END IF;
  IF EXISTS(SELECT 1 FROM public.marketplace_listings WHERE item_id=i.id AND status IN ('active','reserved')) THEN RAISE EXCEPTION 'Listed collectibles cannot be gifted'; END IF;
  SELECT user_id INTO target FROM public.profiles WHERE username=lower(trim(ltrim(_recipient,'@')));
  IF target IS NULL OR target=u OR public.check_user_banned(target) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.blocked_users WHERE (blocker_id=u AND blocked_id=target) OR (blocker_id=target AND blocked_id=u)) THEN RAISE EXCEPTION 'Recipient unavailable'; END IF;
  UPDATE public.figurine_items SET owner_id=target WHERE id=i.id;
  INSERT INTO public.direct_messages(sender_id,receiver_id,content) SELECT u,target,'🎁 '||name||' · #'||i.serial FROM public.figurines WHERE id=i.figurine_id;
  RETURN i.id;
 ELSIF _action='buy_listing' THEN
  SELECT * INTO l FROM public.marketplace_listings WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR l.status<>'active' OR l.seller_id=u THEN RAISE EXCEPTION 'Listing unavailable'; END IF;
  SELECT * INTO i FROM public.figurine_items WHERE id=l.item_id AND owner_id=l.seller_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller no longer owns this collectible'; END IF;
  SELECT balance INTO balance_now FROM public.wallets WHERE user_id=u FOR UPDATE;
  IF balance_now IS NULL OR balance_now<l.price THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE public.wallets SET balance=balance-l.price WHERE user_id=u;
  UPDATE public.marketplace_listings SET status='reserved' WHERE id=l.id;
  INSERT INTO public.escrow_orders(listing_id,buyer_id,seller_id,amount,status) VALUES(l.id,u,l.seller_id,l.price,'held') RETURNING id INTO result;
  RETURN result;
 ELSIF _action IN ('confirm_order','cancel_order') THEN
  SELECT * INTO o FROM public.escrow_orders WHERE id=_id AND buyer_id=u FOR UPDATE;
  IF NOT FOUND OR o.status<>'held' THEN RAISE EXCEPTION 'Order unavailable'; END IF;
  SELECT * INTO l FROM public.marketplace_listings WHERE id=o.listing_id FOR UPDATE;
  SELECT * INTO i FROM public.figurine_items WHERE id=l.item_id FOR UPDATE;
  IF _action='cancel_order' THEN
   UPDATE public.wallets SET balance=balance+o.amount WHERE user_id=u;
   UPDATE public.escrow_orders SET status='refunded' WHERE id=o.id;
   UPDATE public.marketplace_listings SET status='active' WHERE id=l.id;
  ELSE
   IF i.owner_id<>o.seller_id THEN RAISE EXCEPTION 'Ownership changed; cancel this order'; END IF;
   SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY id LIMIT 1;
   IF admin_id IS NULL THEN RAISE EXCEPTION 'Marketplace settlement unavailable'; END IF;
   fee := round(o.amount*0.05,2);
   INSERT INTO public.wallets(user_id,balance) VALUES(o.seller_id,0),(admin_id,0) ON CONFLICT(user_id) DO NOTHING;
   UPDATE public.wallets SET balance=balance+o.amount-fee WHERE user_id=o.seller_id;
   UPDATE public.wallets SET balance=balance+fee WHERE user_id=admin_id;
   UPDATE public.figurine_items SET owner_id=u WHERE id=i.id;
   UPDATE public.escrow_orders SET status='released' WHERE id=o.id;
   UPDATE public.marketplace_listings SET status='sold' WHERE id=l.id;
  END IF;
  RETURN o.id;
 END IF;
 RAISE EXCEPTION 'Unknown marketplace action';
END $$;
REVOKE ALL ON FUNCTION public.market_action(text,uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_action(text,uuid,text,numeric) TO authenticated;
