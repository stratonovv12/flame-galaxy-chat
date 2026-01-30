import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface FlameInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const FlameInput = forwardRef<HTMLInputElement, FlameInputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground/80 mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full touch-target px-4 py-3 rounded-lg",
            "bg-input border border-border",
            "text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "transition-all duration-200",
            error && "border-destructive focus:ring-destructive/50",
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }
);

FlameInput.displayName = "FlameInput";

export { FlameInput };
