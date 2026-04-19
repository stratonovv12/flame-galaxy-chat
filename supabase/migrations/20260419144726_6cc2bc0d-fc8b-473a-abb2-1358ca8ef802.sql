
-- Add wallet_address column (unique, permanent per user)
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS wallet_address text UNIQUE;

-- Function to generate a pseudo-realistic unique crypto wallet address
CREATE OR REPLACE FUNCTION public.generate_wallet_address()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _addr text;
  _exists boolean;
BEGIN
  LOOP
    -- Format: FLM + 38 hex chars (deterministic-looking, unique per user)
    _addr := 'FLM' || encode(gen_random_bytes(19), 'hex');
    SELECT EXISTS(SELECT 1 FROM public.wallets WHERE wallet_address = _addr) INTO _exists;
    EXIT WHEN NOT _exists;
  END LOOP;
  RETURN _addr;
END;
$$;

-- Trigger to auto-assign wallet address on insert
CREATE OR REPLACE FUNCTION public.assign_wallet_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.wallet_address IS NULL THEN
    NEW.wallet_address := public.generate_wallet_address();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallets_assign_address ON public.wallets;
CREATE TRIGGER wallets_assign_address
BEFORE INSERT ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.assign_wallet_address();

-- Backfill existing wallets without an address
UPDATE public.wallets
SET wallet_address = public.generate_wallet_address()
WHERE wallet_address IS NULL;
