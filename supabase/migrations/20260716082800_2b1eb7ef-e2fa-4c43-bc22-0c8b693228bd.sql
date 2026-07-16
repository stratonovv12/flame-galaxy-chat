
CREATE TABLE public.mini_app_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES public.mini_apps(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_app_state TO authenticated;
GRANT ALL ON public.mini_app_state TO service_role;

ALTER TABLE public.mini_app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mini app state"
  ON public.mini_app_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_mini_app_state_updated_at
  BEFORE UPDATE ON public.mini_app_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mini_app_state_user_app ON public.mini_app_state(user_id, app_id);
