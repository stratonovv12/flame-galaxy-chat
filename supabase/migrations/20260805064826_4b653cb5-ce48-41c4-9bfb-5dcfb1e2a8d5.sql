CREATE TABLE public.token_collections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  image_url text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.token_collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.token_collections TO authenticated;
GRANT ALL ON public.token_collections TO service_role;

ALTER TABLE public.token_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view collections" ON public.token_collections FOR SELECT USING (true);
CREATE POLICY "Admins can create collections" ON public.token_collections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update collections" ON public.token_collections FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete collections" ON public.token_collections FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_token_collections_updated_at BEFORE UPDATE ON public.token_collections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.figurines ADD COLUMN collection_id uuid REFERENCES public.token_collections(id) ON DELETE SET NULL;