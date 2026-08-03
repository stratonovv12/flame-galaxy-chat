import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FlameButton } from "@/components/ui/FlameButton";
import { X, Send } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
}

/** Full-screen plain text editor for long messages (no formatting, no presentation). */
export function TextExpander({ open, onOpenChange, value, onChange, onSend }: Props) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(value);

  useEffect(() => { if (open) setDraft(value); }, [open]);

  const apply = () => { onChange(draft); onOpenChange(false); };
  const send = () => { onChange(""); onOpenChange(false); onSend(draft); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) apply(); else onOpenChange(o); }}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !max-h-none !rounded-none glass-card border-primary/30 p-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-glow">{t("writeMessage")}</h2>
          <button onClick={apply} className="p-2 rounded-lg hover:bg-muted/50" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 p-3">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={t("writeMessage")}
            className="w-full h-full bg-muted/20 border border-border rounded-lg p-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 [overflow-wrap:anywhere]"
          />
        </div>
        <div className="px-3 py-3 border-t border-border shrink-0">
          <FlameButton onClick={send} disabled={!draft.trim()} className="w-full">
            <Send className="w-4 h-4 mr-2" />{t("send")}
          </FlameButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
