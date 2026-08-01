import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FlameButton } from "@/components/ui/FlameButton";
import { RichContent, RichDoc } from "@/components/ui/RichContent";
import {
  Bold, Italic, Heading1, Table as TableIcon, Image as ImageIcon, List, Quote,
  Palette, X, Eye, Pencil, Send,
} from "lucide-react";

const BG_PRESETS = [
  { label: "None", value: "" },
  { label: "Deep", value: "linear-gradient(135deg,#1a1a2e,#2a1a4a)" },
  { label: "Ember", value: "linear-gradient(135deg,#2b1408,#4a1f0a)" },
  { label: "Slate", value: "linear-gradient(135deg,#1c1c22,#2c2c36)" },
];
const COLOR_PRESETS = ["", "#ffffff", "#a87cff", "#ff8a4c", "#7ee0c0", "#ffd166"];
const FONTS = [
  { label: "Default", value: "" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, monospace" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: RichDoc;
  submitLabel?: string;
  title?: string;
  onSubmit: (doc: RichDoc) => void;
}

/** Full-screen rich text / presentation builder (markdown + tables + images + styling). */
export function RichComposer({ open, onOpenChange, initial, onSubmit, submitLabel = "Send", title = "Rich editor" }: Props) {
  const [md, setMd] = useState(initial?.md || "");
  const [bg, setBg] = useState(initial?.bg || "");
  const [color, setColor] = useState(initial?.color || "");
  const [font, setFont] = useState(initial?.font || "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const wrap = (before: string, after = before) => setMd(v => `${v}${before}text${after}`);
  const insert = (snippet: string) => setMd(v => (v ? `${v}\n${snippet}` : snippet));

  const submit = () => {
    if (!md.trim()) return;
    onSubmit({ md: md.trim(), bg: bg || undefined, color: color || undefined, font: font || undefined });
    setMd("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !max-h-none !rounded-none glass-card border-primary/30 p-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-glow">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(m => (m === "edit" ? "preview" : "edit"))}
              className="p-2 rounded-lg hover:bg-primary/10 text-primary"
              aria-label="Toggle preview">
              {mode === "edit" ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button onClick={() => onOpenChange(false)} className="p-2 rounded-lg hover:bg-muted/50" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border shrink-0">
          {[
            [Bold, () => wrap("**")],
            [Italic, () => wrap("*")],
            [Heading1, () => insert("# Heading")],
            [List, () => insert("- item 1\n- item 2")],
            [Quote, () => insert("> quote")],
            [TableIcon, () => insert("| Col A | Col B |\n| --- | --- |\n| 1 | 2 |")],
            [ImageIcon, () => insert("![alt](https://)")],
          ].map(([Icon, fn]: any, i) => (
            <button key={i} onClick={fn} className="p-2 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary">
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {mode === "edit" ? (
            <textarea
              value={md}
              onChange={e => setMd(e.target.value)}
              placeholder={"Write with markdown…\n\n# Title\n**bold**, *italic*\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"}
              className="w-full h-full min-h-[45vh] bg-muted/25 border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 [overflow-wrap:anywhere]"
            />
          ) : (
            <RichContent doc={{ md: md || "_Nothing to preview yet_", bg, color, font }} />
          )}
        </div>

        <div className="px-3 py-2 border-t border-border space-y-2 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
            {BG_PRESETS.map(p => (
              <button key={p.label} onClick={() => setBg(p.value)}
                className={`px-2 py-1 rounded-md text-[11px] border shrink-0 ${bg === p.value ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {p.label}
              </button>
            ))}
            {COLOR_PRESETS.map(c => (
              <button key={c || "auto"} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border shrink-0 ${color === c ? "border-primary" : "border-border"}`}
                style={{ background: c || "transparent" }}
                aria-label={c || "default color"} />
            ))}
            <select value={font} onChange={e => setFont(e.target.value)}
              className="px-2 py-1 rounded-md bg-input border border-border text-[11px] shrink-0">
              {FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <FlameButton onClick={submit} disabled={!md.trim()} className="w-full">
            <Send className="w-4 h-4 mr-2" />{submitLabel}
          </FlameButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
