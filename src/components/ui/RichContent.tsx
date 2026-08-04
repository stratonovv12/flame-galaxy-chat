import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Play } from "lucide-react";

export const RICH_PREFIX = "__RICH__:";

export interface RichDoc {
  md: string;
  bg?: string;
  color?: string;
  font?: string;
}

export function encodeRich(doc: RichDoc) {
  return RICH_PREFIX + JSON.stringify(doc);
}

export function parseRich(content?: string | null): RichDoc | null {
  if (!content || !content.startsWith(RICH_PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(RICH_PREFIX.length));
    if (typeof parsed?.md !== "string") return null;
    return parsed as RichDoc;
  } catch {
    return null;
  }
}

interface Props {
  doc: RichDoc;
  className?: string;
  compact?: boolean;
  /** Show the PowerPoint-style "Present" control for multi-slide docs. */
  presentable?: boolean;
}

/** Renders a rich markdown presentation (tables, images, styling) safely. */
export function RichContent({ doc, className = "", compact, presentable = true }: Props) {
  const [presenting, setPresenting] = useState(false);
  const slideCount = doc.md.split(/^\s*---\s*$/m).map(s => s.trim()).filter(Boolean).length;
  const showPresent = presentable && slideCount > 1;

  return (
    <div
      className={`rounded-xl overflow-hidden border border-border/60 ${className}`}
      style={{ background: doc.bg || "transparent", color: doc.color || undefined, fontFamily: doc.font || undefined }}
    >
      {showPresent && (
        <div className="flex items-center justify-between px-3 pt-2">
          <span className="text-[11px] text-muted-foreground">{slideCount} slides</span>
          <button
            onClick={() => setPresenting(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/20 text-primary text-[11px] hover:bg-primary/30">
            <Play className="w-3 h-3" /> Present
          </button>
        </div>
      )}
      {showPresent && (
        <LazyPresentation doc={doc} open={presenting} onOpenChange={setPresenting} />
      )}
      <div className={`prose prose-invert max-w-none ${compact ? "p-3 text-sm" : "p-4"} [overflow-wrap:anywhere]`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border border-border/70 px-2 py-1 bg-muted/40 text-left">{children}</th>,
            td: ({ children }) => <td className="border border-border/70 px-2 py-1">{children}</td>,
            img: ({ src, alt }) => (
              <img src={src as string} alt={alt || ""} loading="lazy" className="max-w-full rounded-lg my-2" />
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>
            ),
            code: ({ children }) => <code className="px-1 py-0.5 rounded bg-muted/60 text-xs">{children}</code>,
          }}
        >
          {doc.md}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function LazyPresentation({ doc, open, onOpenChange }: { doc: RichDoc; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { PresentationViewer } = require("@/components/ui/PresentationViewer");
  return <PresentationViewer doc={doc} open={open} onOpenChange={onOpenChange} />;
}
