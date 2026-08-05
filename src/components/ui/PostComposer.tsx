import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlameButton } from "@/components/ui/FlameButton";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { uploadToMedia } from "@/lib/uploads";
import { toast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, X, Presentation, Send } from "lucide-react";

export interface SimplePost {
  text: string;
  /** Uploaded media in the order the user picked them. */
  media: { url: string; type: "image" | "video" }[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  onSubmit: (post: SimplePost) => void | Promise<void>;
  /** Opens the full presentation builder instead. */
  onOpenPresentation?: () => void;
}

/**
 * Default post creation modal: a plain text field with optional photo/video
 * attachments. Presentations are a separate, explicit choice.
 */
export function PostComposer({ open, onOpenChange, title, onSubmit, onOpenPresentation }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<SimplePost["media"]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (files: FileList | null) => {
    if (!files || !user) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) { toast({ title: "File too large", variant: "destructive" }); continue; }
      try {
        const url = await uploadToMedia(file, user.id, "posts");
        setMedia(prev => [...prev, { url, type: file.type.startsWith("video") ? "video" : "image" }]);
      } catch (e: any) {
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      }
    }
    setBusy(false);
  };

  const submit = async () => {
    if (!text.trim() && media.length === 0) return;
    setBusy(true);
    await onSubmit({ text: text.trim(), media });
    setBusy(false);
    setText(""); setMedia([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-primary/30 max-w-md">
        <DialogHeader><DialogTitle>{title || t("createPost")}</DialogTitle></DialogHeader>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t("whatsOnYourMind")}
          rows={5}
          className="w-full bg-muted/25 border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 [overflow-wrap:anywhere]"
        />

        {media.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {media.map((m, i) => (
              <div key={m.url} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                {m.type === "video"
                  ? <video src={m.url} className="w-full h-full object-cover" muted playsInline />
                  : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                <button
                  onClick={() => setMedia(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 p-1 rounded-full bg-background/80 text-destructive"
                  aria-label="Remove">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <FlameButton variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
            {t("addPhotosVideos")}
          </FlameButton>
          {onOpenPresentation && (
            <FlameButton variant="outline" size="sm" className="flex-1"
              onClick={() => { onOpenChange(false); onOpenPresentation(); }}>
              <Presentation className="w-4 h-4 mr-2" />{t("addPresentation")}
            </FlameButton>
          )}
          <input ref={fileInput} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={e => { pick(e.target.files); e.currentTarget.value = ""; }} />
        </div>

        <FlameButton className="w-full" disabled={busy || (!text.trim() && media.length === 0)} onClick={submit}>
          <Send className="w-4 h-4 mr-2" />{t("createPost")}
        </FlameButton>
      </DialogContent>
    </Dialog>
  );
}
