import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RichContent, RichDoc } from "@/components/ui/RichContent";
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2 } from "lucide-react";

/** Split a rich markdown doc into PowerPoint-style slides on `---` separators. */
export function splitSlides(md: string): string[] {
  const parts = md.split(/^\s*---\s*$/m).map(s => s.trim()).filter(Boolean);
  return parts.length ? parts : [md];
}

interface Props {
  doc: RichDoc;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** Full-screen PowerPoint-style presentation player with smooth slide transitions. */
export function PresentationViewer({ doc, open, onOpenChange }: Props) {
  const slides = splitSlides(doc.md);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [isFull, setIsFull] = useState(false);

  const go = useCallback((delta: number) => {
    setDir(delta > 0 ? 1 : -1);
    setIndex(i => Math.min(slides.length - 1, Math.max(0, i + delta)));
  }, [slides.length]);

  useEffect(() => { if (open) setIndex(0); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onOpenChange]);

  const toggleFull = async () => {
    try {
      if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); setIsFull(true); }
      else { await document.exitFullscreen(); setIsFull(false); }
    } catch { /* fullscreen not available */ }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-background/98 backdrop-blur-xl flex flex-col animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
        <p className="text-xs text-muted-foreground">{index + 1} / {slides.length}</p>
        <div className="flex items-center gap-1">
          <button onClick={toggleFull} className="p-2 rounded-lg hover:bg-primary/10 text-primary" aria-label="Full screen">
            {isFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => onOpenChange(false)} className="p-2 rounded-lg hover:bg-muted/50" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-3 sm:p-8">
        <div
          key={index}
          className={`w-full max-w-4xl max-h-full overflow-y-auto ${dir > 0 ? "animate-slide-in-right" : "animate-slide-in-left"}`}
        >

          <RichContent doc={{ ...doc, md: slides[index] }} className="min-h-[45vh]" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 shrink-0">
        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 disabled:opacity-40 text-sm">
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => { setDir(i > index ? 1 : -1); setIndex(i); }}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40"}`}
              aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
        <button
          onClick={() => go(1)}
          disabled={index === slides.length - 1}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 text-sm">
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}
