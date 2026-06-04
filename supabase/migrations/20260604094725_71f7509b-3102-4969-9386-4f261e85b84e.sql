
-- ============ DROP OLD ============
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.trade_offers CASCADE;
DROP TABLE IF EXISTS public.marketplace_listings CASCADE;
DROP TABLE IF EXISTS public.user_inventory CASCADE;
DROP TABLE IF EXISTS public.deposit_requests CASCADE;

DROP TABLE IF EXISTS public.group_messages CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.group_admins CASCADE;
DROP TABLE IF EXISTS public.verified_groups CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;

DROP TABLE IF EXISTS public.channel_subscribers CASCADE;
DROP TABLE IF EXISTS public.channel_admins CASCADE;
DROP TABLE IF EXISTS public.verified_channels CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;
DROP TABLE IF EXISTS public.channels CASCADE;

DROP TABLE IF EXISTS public.post_comments CASCADE;
DROP TABLE IF EXISTS public.post_likes CASCADE;
DROP TABLE IF EXISTS public.profile_posts CASCADE;

DROP FUNCTION IF EXISTS public.gift_item(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.buy_listing(uuid, uuid);
DROP FUNCTION IF EXISTS public.accept_trade(uuid, uuid);

ALTER TABLE public.profiles DROP COLUMN IF EXISTS steam_trade_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS inventory_visibility;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS messages_privacy text NOT NULL DEFAULT 'everyone' CHECK (messages_privacy IN ('everyone','followers'));

-- ============ FEED POSTS ============
CREATE TABLE public.feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  media_url text,
  media_type text CHECK (media_type IN ('image','video')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feed_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.feed_posts TO authenticated;
GRANT ALL ON public.feed_posts TO service_role;
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Feed posts are public" ON public.feed_posts FOR SELECT USING (true);
CREATE POLICY "Users insert own posts" ON public.feed_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users delete own posts" ON public.feed_posts FOR DELETE TO authenticated USING (auth.uid() = author_id);
CREATE INDEX feed_posts_created_idx ON public.feed_posts (created_at DESC);
CREATE INDEX feed_posts_author_idx ON public.feed_posts (author_id);

-- ============ FEED LIKES ============
CREATE TABLE public.feed_likes (
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT ON public.feed_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.feed_likes TO authenticated;
GRANT ALL ON public.feed_likes TO service_role;
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes are public" ON public.feed_likes FOR SELECT USING (true);
CREATE POLICY "Users like once" ON public.feed_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unlike own" ON public.feed_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ FEED COMMENTS ============
CREATE TABLE public.feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feed_comments TO anon, authenticated;
GRANT INSERT, DELETE ON public.feed_comments TO authenticated;
GRANT ALL ON public.feed_comments TO service_role;
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are public" ON public.feed_comments FOR SELECT USING (true);
CREATE POLICY "Users comment as self" ON public.feed_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON public.feed_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX feed_comments_post_idx ON public.feed_comments (post_id, created_at);

-- ============ FOLLOWS ============
CREATE TABLE public.user_follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT ON public.user_follows TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_follows TO authenticated;
GRANT ALL ON public.user_follows TO service_role;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Follows are public" ON public.user_follows FOR SELECT USING (true);
CREATE POLICY "Users follow as self" ON public.user_follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users unfollow own" ON public.user_follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);
CREATE INDEX user_follows_following_idx ON public.user_follows (following_id);

-- ============ MUTUAL FOLLOW HELPER (for messages_privacy) ============
CREATE OR REPLACE FUNCTION public.is_mutual_follow(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_follows f1
    JOIN public.user_follows f2
      ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
    WHERE f1.follower_id = _a AND f1.following_id = _b
  )
$$;
