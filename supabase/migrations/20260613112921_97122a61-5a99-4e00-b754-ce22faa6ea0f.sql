
-- 1) pinned_messages (max 2 per chat enforced via trigger)
CREATE TABLE public.pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.pinned_messages TO authenticated;
GRANT ALL ON public.pinned_messages TO service_role;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own pins" ON public.pinned_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users pin own" ON public.pinned_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users unpin own" ON public.pinned_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.enforce_pin_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.pinned_messages WHERE user_id = NEW.user_id AND partner_id = NEW.partner_id) >= 2 THEN
    RAISE EXCEPTION 'pin_limit_exceeded';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_enforce_pin_limit BEFORE INSERT ON public.pinned_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pin_limit();

-- 2) deleted_conversations (sticky chat hide)
CREATE TABLE public.deleted_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);
GRANT SELECT, INSERT, DELETE ON public.deleted_conversations TO authenticated;
GRANT ALL ON public.deleted_conversations TO service_role;
ALTER TABLE public.deleted_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own deletions" ON public.deleted_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) push_subscriptions for Web Push
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own subs" ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) reposts on feed_posts
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS repost_of uuid REFERENCES public.feed_posts(id) ON DELETE SET NULL;

-- 5) allow anonymous read of feed_posts (so share links can show a post for sign-up gating)
DROP POLICY IF EXISTS "Posts are public" ON public.feed_posts;
CREATE POLICY "Posts are public" ON public.feed_posts FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.feed_posts TO anon;
GRANT SELECT ON public.profiles TO anon;
