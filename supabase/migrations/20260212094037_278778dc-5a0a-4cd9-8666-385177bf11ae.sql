
-- AI conversation topics (threads)
CREATE TABLE public.ai_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Новый чат',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own topics" ON public.ai_topics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add topic_id to ai_conversations
ALTER TABLE public.ai_conversations ADD COLUMN topic_id UUID REFERENCES public.ai_topics(id) ON DELETE CASCADE;

-- Add reply/forward to direct_messages
ALTER TABLE public.direct_messages ADD COLUMN reply_to_id UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL;
ALTER TABLE public.direct_messages ADD COLUMN forwarded_from TEXT;

-- Add reply/forward to group_messages
ALTER TABLE public.group_messages ADD COLUMN reply_to_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL;
ALTER TABLE public.group_messages ADD COLUMN forwarded_from TEXT;

-- Enable realtime for ai_topics
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_topics;

-- Trigger for updated_at on ai_topics
CREATE TRIGGER update_ai_topics_updated_at
  BEFORE UPDATE ON public.ai_topics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
