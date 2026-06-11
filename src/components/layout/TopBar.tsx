import { useState, useEffect } from "react";
import { Search, Flame, User } from "lucide-react";
import { FlameInput } from "@/components/ui/FlameInput";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenSearch?: () => void;
  onOpenProfile?: () => void;
}

export function TopBar({ searchQuery, onSearchChange, onOpenSearch, onOpenProfile }: TopBarProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setAvatarUrl(data.avatar_url); });
  }, [user]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card rounded-none border-b border-border/50 pt-safe">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center neon-glow-sm">
            <Flame className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>

        <div className="relative flex-1">
          <FlameInput
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => onOpenSearch?.()}
            className="pl-10 py-2.5 text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>

        <button onClick={onOpenSearch} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target shrink-0" title={t("search")}>
          <Search className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
        </button>

        <button onClick={onOpenProfile} className="shrink-0" title={t("profile")}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border/50" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"><User className="w-4 h-4 text-muted-foreground" /></div>
          )}
        </button>
      </div>
    </header>
  );
}
