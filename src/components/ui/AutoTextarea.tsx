import { forwardRef, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AutoTextarea({ className, value, ...props }, ref) {
  const local = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = local.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(160, Math.max(44, el.scrollHeight))}px`;
    };
    resize();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; resize(); } });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);
  return <textarea {...props} value={value} rows={1} ref={el => { local.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }} className={cn("auto-textarea", className)} />;
});