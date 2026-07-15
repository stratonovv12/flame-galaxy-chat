
CREATE TABLE IF NOT EXISTS public.dm_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, voter_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_poll_votes TO authenticated;
GRANT ALL ON public.dm_poll_votes TO service_role;

ALTER TABLE public.dm_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voters can read votes for their messages"
ON public.dm_poll_votes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.direct_messages m
    WHERE m.id = dm_poll_votes.message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "voters can cast their own vote"
ON public.dm_poll_votes FOR INSERT TO authenticated
WITH CHECK (
  voter_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.direct_messages m
    WHERE m.id = dm_poll_votes.message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "voters can update their own vote"
ON public.dm_poll_votes FOR UPDATE TO authenticated
USING (voter_id = auth.uid()) WITH CHECK (voter_id = auth.uid());
