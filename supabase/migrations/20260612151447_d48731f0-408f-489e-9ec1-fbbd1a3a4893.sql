CREATE TABLE public.mini_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  app_type TEXT NOT NULL DEFAULT 'html' CHECK (app_type IN ('html','python')),
  content TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mini_apps_handle_lc_idx ON public.mini_apps (lower(handle));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_apps TO authenticated;
GRANT ALL ON public.mini_apps TO service_role;
ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view published apps or own apps"
  ON public.mini_apps FOR SELECT TO authenticated
  USING (published = true OR creator_id = auth.uid());

CREATE POLICY "Creators can insert own apps"
  ON public.mini_apps FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creators can update own apps"
  ON public.mini_apps FOR UPDATE TO authenticated
  USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creators can delete own apps"
  ON public.mini_apps FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

CREATE TRIGGER update_mini_apps_updated_at BEFORE UPDATE ON public.mini_apps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();