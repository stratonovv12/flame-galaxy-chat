
CREATE TABLE public.flame_moments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flame_moments TO authenticated;
GRANT ALL ON public.flame_moments TO service_role;

ALTER TABLE public.flame_moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "moments_select_all" ON public.flame_moments FOR SELECT TO authenticated USING (expires_at > now());
CREATE POLICY "moments_insert_own" ON public.flame_moments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "moments_delete_own" ON public.flame_moments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_flame_moments_created ON public.flame_moments (created_at DESC);
CREATE INDEX idx_flame_moments_user ON public.flame_moments (user_id);
