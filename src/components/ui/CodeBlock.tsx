import { useState, memo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface CodeBlockProps {
  code: string;
  language?: string;
  inline?: boolean;
}

const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh", "console", "terminal", "cmd", "powershell"]);

function normalizeLang(lang?: string): string {
  if (!lang) return "text";
  const l = lang.toLowerCase();
  if (SHELL_LANGS.has(l)) return "bash";
  if (l === "js") return "javascript";
  if (l === "ts") return "typescript";
  if (l === "py") return "python";
  return l;
}

function CodeBlockImpl({ code, language, inline }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  const { lang: appLang } = useLanguage();
  const clean = code.replace(/\n$/, "");

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-muted/60 text-primary text-[0.85em] font-mono break-words">
        {clean}
      </code>
    );
  }

  const lang = normalizeLang(language);
  const isShell = lang === "bash";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-border bg-card w-full max-w-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          {isShell ? "terminal" : lang}
        </span>
        <Button variant="ghost" size="sm"
          type="button"
          onClick={copy}
          aria-label={appLang === "ru" ? "Копировать код" : "Copy code"}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 hover:bg-primary/30 border border-border/40 text-[11px] text-foreground/90 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
          <span className="font-medium">{copied ? (appLang === "ru" ? "Скопировано" : "Copied!") : (appLang === "ru" ? "Копировать" : "Copy")}</span>
        </Button>
      </div>
      <div className="overflow-x-hidden max-h-[60vh] overflow-y-auto">
        <SyntaxHighlighter
          language={lang}
          style={theme === "light" ? oneLight : oneDark}
          PreTag="div"
          wrapLongLines
          customStyle={{
            margin: 0,
            padding: "12px 14px",
            background: "transparent",
            fontSize: "12.5px",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
          codeTagProps={{
            style: {
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            },
          }}
        >
          {clean}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

export const CodeBlock = memo(CodeBlockImpl);
