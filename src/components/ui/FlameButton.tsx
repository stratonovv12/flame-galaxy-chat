import { forwardRef, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface FlameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

const FlameButton = forwardRef<HTMLButtonElement, FlameButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const baseStyles = "touch-target inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg disabled:opacity-50 disabled:pointer-events-none";
    
    const variants = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90 neon-glow-sm hover:neon-glow active:scale-95",
      secondary: "glass-card text-foreground hover:bg-secondary/80 active:scale-95",
      ghost: "text-foreground hover:bg-muted/50 active:scale-95",
      outline: "border border-primary/50 text-primary hover:bg-primary/10 hover:border-primary active:scale-95",
    };

    const sizes = {
      sm: "px-3 py-2 text-sm min-h-[36px]",
      md: "px-4 py-2.5 text-sm min-h-[44px]",
      lg: "px-6 py-3 text-base min-h-[52px]",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

FlameButton.displayName = "FlameButton";

export { FlameButton };
