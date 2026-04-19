
CREATE OR REPLACE FUNCTION public.generate_wallet_address()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _addr text;
  _exists boolean;
BEGIN
  LOOP
    _addr := 'FLM' || encode(gen_random_bytes(19), 'hex');
    SELECT EXISTS(SELECT 1 FROM public.wallets WHERE wallet_address = _addr) INTO _exists;
    EXIT WHEN NOT _exists;
  END LOOP;
  RETURN _addr;
END;
$$;
