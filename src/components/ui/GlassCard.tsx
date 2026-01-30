import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, glow = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "glass-card p-4",
          glow && "neon-glow-sm",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";

export { GlassCard };
