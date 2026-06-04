import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameInput } from "@/components/ui/FlameInput";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { Search, MessageCircle, User, ChevronRight } from "lucide-react";

interface Profile { id: string; username: string | null; display_name: string | null; user_id: string; avatar_url: string | null; }

interface SearchViewProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onStartChat?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
}

export function SearchView({ searchQuery, onSearchChange, onStartChat, onViewProfile }: SearchViewProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) performSearch(searchQuery);
    else setProfiles([]);
  }, [searchQuery]);

  const escapePattern = (str: string) => str.replace(/[%_\\]/g, "\\$&");

  const performSearch = async (query: string) => {
    setLoading(true);
    const q = escapePattern(query.replace(/^@/, ""));
    if (q.length < 2) { setProfiles([]); setLoading(false); return; }
    const { data } = await supabase.from("profiles").select("id, username, display_name, user_id, avatar_url")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(25);
    setProfiles(data || []);
    setLoading(false);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="relative">
        <FlameInput type="text" placeholder={t("searchByName")} value={searchQuery} onChange={e => onSearchChange(e.target.value)} className="pl-12" />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      </div>

      {!searchQuery.trim() ? (
        <GlassCard className="text-center py-12">
          <Search className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">{t("search")}</h3>
          <p className="text-muted-foreground">{t("searchHint")}</p>
        </GlassCard>
      ) : loading ? (
        <div className="text-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : profiles.length === 0 ? (
        <GlassCard className="text-center py-12">
          <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">{t("nothingFound")}</h3>
        </GlassCard>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2"><User className="w-4 h-4" /> {t("people")}</h3>
          <div className="space-y-2">
            {profiles.filter(p => p.user_id !== user?.id).map(profile => (
              <GlassCard key={profile.id} className="p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onViewProfile?.(profile.user_id)}>
                <div className="flex items-center gap-3">
                  <UserAvatar username={profile.display_name || profile.username} avatarUrl={profile.avatar_url} size="md" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-medium">{profile.display_name || profile.username || t("noName")}</h4>
                      <UserBadge userId={profile.user_id} />
                    </div>
                    {profile.username && <p className="text-xs text-primary/70">@{profile.username.replace(/^@/, "")}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {onStartChat && <FlameButton size="sm" onClick={e => { e.stopPropagation(); onStartChat(profile.user_id); }}><MessageCircle className="w-4 h-4" /></FlameButton>}
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
