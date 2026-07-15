
ALTER TABLE public.mini_apps ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_mini_apps_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.mini_apps WHERE creator_id = NEW.creator_id) >= 5 THEN
    RAISE EXCEPTION 'mini_apps_limit_reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mini_apps_limit ON public.mini_apps;
CREATE TRIGGER mini_apps_limit BEFORE INSERT ON public.mini_apps
FOR EACH ROW EXECUTE FUNCTION public.enforce_mini_apps_limit();

-- Allow admins to update any mini app (suspend)
DROP POLICY IF EXISTS "Admins can update mini apps" ON public.mini_apps;
CREATE POLICY "Admins can update mini apps" ON public.mini_apps
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete mini apps" ON public.mini_apps;
CREATE POLICY "Admins can delete mini apps" ON public.mini_apps
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
