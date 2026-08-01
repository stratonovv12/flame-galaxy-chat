import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Plus, FileText, BarChart3, X, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export const POLL_PREFIX = "__POLL__:";

export function encodePoll(question: string, options: string[]) {
  return POLL_PREFIX + JSON.stringify({ q: question, opts: options });
}
export function parsePoll(content: string): { q: string; opts: string[] } | null {
  if (!content?.startsWith(POLL_PREFIX)) return null;
  try { return JSON.parse(content.slice(POLL_PREFIX.length)); } catch { return null; }
}

interface Props {
  onSendFile: (url: string, filename: string) => void;
  onSendPoll: (question: string, options: string[]) => void;
  onSendSticker?: (url: string, type: string) => void;
  onOpenRichEditor?: () => void;
}

export function DMAttachmentsButton({ onSendFile, onSendPoll, onSendSticker, onOpenRichEditor }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    if (f.size > 20 * 1024 * 1024) {
      toast({ title: "Error", description: "Max file size 20MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/files/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from("media").upload(path, f, { cacheControl: "3600", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      if (data?.publicUrl) onSendFile(data.publicUrl, f.name);
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submitPoll = () => {
    const cleanOpts = opts.map(o => o.trim()).filter(Boolean);
    if (!q.trim() || cleanOpts.length < 2) {
      toast({ title: "Error", description: "Question and at least 2 options required", variant: "destructive" });
      return;
    }
    onSendPoll(q.trim(), cleanOpts.slice(0, 6));
    setQ(""); setOpts(["", ""]);
    setPollOpen(false);
    setOpen(false);
  };

  return (
    <>
      <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden" disabled={uploading} />
      <button
        onClick={() => setOpen(true)}
        disabled={uploading}
        className="p-2 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-primary touch-target shrink-0"
        aria-label="Attachments"
      >
        {uploading ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="glass-card border-primary/30 rounded-t-2xl max-h-[50vh]">
          <SheetHeader>
            <SheetTitle>Add to message</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-colors"
            >
              <FileText className="w-7 h-7 text-primary" />
              <span className="text-sm font-medium">File / Document</span>
            </button>
            <button
              onClick={() => setPollOpen(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-colors"
            >
              <BarChart3 className="w-7 h-7 text-primary" />
              <span className="text-sm font-medium">Create Poll</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={pollOpen} onOpenChange={setPollOpen}>
        <DialogContent className="glass-card border-primary/30 max-w-md">
          <DialogHeader>
            <DialogTitle>Create a poll</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <FlameInput placeholder="Poll question" value={q} onChange={e => setQ(e.target.value)} maxLength={140} />
            {opts.map((o, i) => (
              <div key={i} className="flex gap-2">
                <FlameInput
                  placeholder={`Option ${i + 1}`}
                  value={o}
                  onChange={e => setOpts(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                  maxLength={60}
                  className="flex-1"
                />
                {opts.length > 2 && (
                  <button onClick={() => setOpts(prev => prev.filter((_, idx) => idx !== i))} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {opts.length < 6 && (
              <button onClick={() => setOpts(prev => [...prev, ""])} className="text-xs text-primary hover:underline">+ Add option</button>
            )}
            <FlameButton onClick={submitPoll} className="w-full">
              <Check className="w-4 h-4 mr-1" /> Send poll
            </FlameButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===== Poll bubble render =====

interface PollBubbleProps {
  messageId: string;
  question: string;
  options: string[];
}

export function PollBubble({ messageId, question, options }: PollBubbleProps) {
  const { user } = useAuth();
  const [votes, setVotes] = useState<number[]>(() => options.map(() => 0));
  const [myVote, setMyVote] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  const load = async () => {
    const { data } = await supabase.from("dm_poll_votes").select("option_index, voter_id").eq("message_id", messageId);
    const counts = options.map(() => 0);
    let mine: number | null = null;
    (data || []).forEach((v: any) => {
      if (v.option_index >= 0 && v.option_index < counts.length) counts[v.option_index] += 1;
      if (user && v.voter_id === user.id) mine = v.option_index;
    });
    setVotes(counts);
    setMyVote(mine);
    setTotal((data || []).length);
  };

  useEffect(() => { load(); }, [messageId]);

  const vote = async (idx: number) => {
    if (!user) return;
    // upsert on unique (message_id, voter_id)
    const { error } = await supabase
      .from("dm_poll_votes")
      .upsert({ message_id: messageId, voter_id: user.id, option_index: idx }, { onConflict: "message_id,voter_id" });
    if (error) { toast({ title: "Vote failed", description: error.message, variant: "destructive" }); return; }
    load();
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
        <BarChart3 className="w-3.5 h-3.5" /> Poll
      </div>
      <p className="font-medium text-sm [overflow-wrap:anywhere]">{question}</p>
      <div className="space-y-1.5">
        {options.map((opt, i) => {
          const pct = total > 0 ? Math.round((votes[i] / total) * 100) : 0;
          const mine = myVote === i;
          return (
            <button
              key={i}
              onClick={() => vote(i)}
              className={`relative w-full text-left rounded-lg overflow-hidden border transition-colors ${mine ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary/20 transition-all"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between px-3 py-2 text-xs">
                <span className="[overflow-wrap:anywhere]">{mine && "✓ "}{opt}</span>
                <span className="font-semibold shrink-0 ml-2">{pct}% ({votes[i]})</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">{total} vote{total === 1 ? "" : "s"}</p>
    </div>
  );
}
