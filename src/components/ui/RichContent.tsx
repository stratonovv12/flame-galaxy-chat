import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
}

/** Renders a rich markdown presentation (tables, images, styling) safely. */
export function RichContent({ doc, className = "", compact }: Props) {
  return (
    <div
      className={`rounded-xl overflow-hidden border border-border/60 ${className}`}
      style={{ background: doc.bg || "transparent", color: doc.color || undefined, fontFamily: doc.font || undefined }}
    >
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
