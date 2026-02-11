
-- 1. Hidden messages table (for "delete for me")
CREATE TABLE public.hidden_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('dm', 'group', 'channel')),
  message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hidden_messages ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_hidden_messages_unique ON public.hidden_messages(user_id, message_type, message_id);

CREATE POLICY "Users can view own hidden" ON public.hidden_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can hide messages" ON public.hidden_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unhide" ON public.hidden_messages FOR DELETE USING (auth.uid() = user_id);

-- 2. Blocked users table
CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_blocked_users_unique ON public.blocked_users(blocker_id, blocked_id);

CREATE POLICY "Users can view own blocks" ON public.blocked_users FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "Users can block" ON public.blocked_users FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can unblock" ON public.blocked_users FOR DELETE USING (auth.uid() = blocker_id);

-- 3. Add DELETE policy for direct messages for receiver too (delete for me uses hidden_messages, but delete for everyone by sender uses actual delete)
-- Already exists for sender. Add one so receiver can also delete their copy? No - "delete for everyone" is sender-only. Receiver uses hidden_messages.

-- 4. Block enforcement: update DM insert policy to check blocking
DROP POLICY IF EXISTS "Users can send messages" ON public.direct_messages;
CREATE POLICY "Users can send messages" ON public.direct_messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  NOT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE blocker_id = direct_messages.receiver_id AND blocked_id = auth.uid()
  )
);

-- 5. Add handle column to groups and channels
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS handle text UNIQUE;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS handle text UNIQUE;

-- 6. Enable realtime for hidden_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.hidden_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_users;
