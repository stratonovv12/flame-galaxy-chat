import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EMOJI_OPTIONS = ["👍", "❤️", "🔥", "😂", "😮", "😢", "🎉", "👏"];

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface MessageReactionsProps {
  postId: string;
  className?: string;
}

export function MessageReactions({ postId, className }: MessageReactionsProps) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [open, setOpen] = useState(false);

  const fetchReactions = async () => {
    const { data } = await supabase
      .from("message_reactions")
      .select("emoji, user_id")
      .eq("post_id", postId);

    if (!data) return;

    const map = new Map<string, { count: number; reacted: boolean }>();
    for (const r of data) {
      const existing = map.get(r.emoji) || { count: 0, reacted: false };
      existing.count++;
      if (r.user_id === user?.id) existing.reacted = true;
      map.set(r.emoji, existing);
    }

    setReactions(
      Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }))
    );
  };

  useEffect(() => {
    fetchReactions();

    const channel = supabase
      .channel(`reactions-${postId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions", filter: `post_id=eq.${postId}` },
        () => fetchReactions()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [postId, user?.id]);

  const toggleReaction = async (emoji: string) => {
    if (!user) return;
    const existing = reactions.find((r) => r.emoji === emoji && r.reacted);

    if (existing) {
      // Remove the same emoji (toggle off)
      await supabase
        .from("message_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
    } else {
      // Single reaction: remove any previous reaction by this user on this post
      await supabase
        .from("message_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      // Then insert the new one
      await supabase
        .from("message_reactions")
        .insert({ post_id: postId, user_id: user.id, emoji });
    }
    setOpen(false);
  };

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => toggleReaction(r.emoji)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border",
            r.reacted
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-muted/30 border-border/50 hover:bg-muted/50"
          )}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors">
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" side="top" align="start">
          <div className="flex gap-1">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/50 text-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
