import { Search, Flame } from "lucide-react";
import { FlameInput } from "@/components/ui/FlameInput";

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function TopBar({ searchQuery, onSearchChange }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card rounded-none border-b border-border/50 pt-safe">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center neon-glow-sm">
            <Flame className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <FlameInput
            type="text"
            placeholder="Поиск людей и каналов..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 py-2.5 text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}
