
CREATE TABLE IF NOT EXISTS public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('deposit','withdrawal')),
  wallet_address text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own requests" ON public.deposit_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own requests" ON public.deposit_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
