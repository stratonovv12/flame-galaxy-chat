import { useState, useEffect } from "react";
import { Search, Flame, User } from "lucide-react";
import { FlameInput } from "@/components/ui/FlameInput";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import flameLogo from "@/assets/flame-logo.png";

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
    <header className="shrink-0 z-40 bg-background border-b border-border pt-safe">
      <div className="flex items-center gap-3 px-4 py-3">
        <img src={flameLogo} alt="FLAME" className="w-8 h-8 rounded-lg shrink-0 object-contain" />

        <div className="relative flex-1 min-w-0">
          <FlameInput
            type="text"
            aria-label={t("search")}
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => onOpenSearch?.()}
            className="pl-10 py-2.5 text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>

        <Button variant="ghost" size="icon" onClick={onOpenProfile} className="shrink-0 rounded-full" aria-label={t("profile")}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border/50" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"><User className="w-4 h-4 text-muted-foreground" /></div>
          )}
        </Button>
      </div>
    </header>
  );
}
