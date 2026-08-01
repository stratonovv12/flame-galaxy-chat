import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlameButton } from "@/components/ui/FlameButton";
import { toast } from "@/hooks/use-toast";
import { Sticker as StickerIcon, Trash2, Upload } from "lucide-react";
import { moderateImageUrl } from "@/lib/moderation";

export interface Sticker {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  created_at: string;
}

const MAX_VIDEO_SECONDS = 10;

async function videoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration || 0); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

/** Personal sticker pack: create photo/short-video stickers and send them in chat. */
export function StickerStudio({
  open, onOpenChange, onSend,
}: { open: boolean; onOpenChange: (o: boolean) => void; onSend?: (s: Sticker) => void }) {
  const { user } = useAuth();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open && user) load(); }, [open, user]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("stickers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setStickers((data as Sticker[]) || []);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast({ title: "Error", description: "Pick a photo or a short video", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Error", description: "Max sticker size is 20MB", variant: "destructive" });
      return;
    }
    if (isVideo) {
      const dur = await videoDuration(file);
      if (dur > MAX_VIDEO_SECONDS + 0.5) {
        toast({ title: "Too long", description: `Video stickers must be ${MAX_VIDEO_SECONDS}s or shorter`, variant: "destructive" });
        return;
      }
    }

    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "png");
      const path = `${user.id}/stickers/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { cacheControl: "3600", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const url = data.publicUrl;

      if (isImage) {
        const verdict = await moderateImageUrl(url);
        if (!verdict.safe) {
          await supabase.storage.from("media").remove([path]);
          toast({ title: "Rejected", description: "This image was flagged as unsafe content", variant: "destructive" });
          return;
        }
      }

      const { error: insErr } = await supabase.from("stickers").insert({
        user_id: user.id, media_url: url, media_type: isVideo ? "video" : "image",
      });
      if (insErr) throw insErr;
      toast({ title: "Sticker saved to your pack" });
      load();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (s: Sticker) => {
    await supabase.from("stickers").delete().eq("id", s.id);
    setStickers(prev => prev.filter(x => x.id !== s.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-primary/30 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><StickerIcon className="w-5 h-5 text-primary" /> My stickers</DialogTitle>
        </DialogHeader>

        <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} disabled={busy} />
        <FlameButton onClick={() => inputRef.current?.click()} disabled={busy} className="w-full">
          <Upload className="w-4 h-4 mr-2" />{busy ? "Uploading…" : `Create sticker (photo or ≤${MAX_VIDEO_SECONDS}s video)`}
        </FlameButton>

        {stickers.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Your pack is empty.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {stickers.map(s => (
              <div key={s.id} className="relative group rounded-xl overflow-hidden border border-border bg-muted/20 aspect-square">
                <button className="w-full h-full" onClick={() => { onSend?.(s); onOpenChange(false); }}>
                  {s.media_type === "video" ? (
                    <video src={s.media_url} muted loop autoPlay playsInline className="w-full h-full object-cover" />
                  ) : (
                    <img src={s.media_url} alt="sticker" className="w-full h-full object-cover" />
                  )}
                </button>
                <button
                  onClick={() => remove(s)}
                  className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
