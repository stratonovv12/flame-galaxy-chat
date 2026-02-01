import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameInput } from "@/components/ui/FlameInput";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Search, Hash, MessageCircle, User, ChevronRight } from "lucide-react";

interface Channel {
  id: string;
  name: string;
  description: string | null;
}

interface Profile {
  id: string;
  username: string | null;
  user_id: string;
  avatar_url: string | null;
}

interface SearchViewProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onStartChat?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
}

export function SearchView({ searchQuery, onSearchChange, onStartChat, onViewProfile }: SearchViewProps) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    } else {
      setChannels([]);
      setProfiles([]);
    }
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setLoading(true);
    
    const [channelsResult, profilesResult] = await Promise.all([
      supabase
        .from("channels")
        .select("id, name, description")
        .ilike("name", `%${query}%`)
        .limit(10),
      supabase
        .from("profiles")
        .select("id, username, user_id, avatar_url")
        .ilike("username", `%${query}%`)
        .limit(10),
    ]);

    setChannels(channelsResult.data || []);
    setProfiles(profilesResult.data || []);
    setLoading(false);
  };

  return (
    <div className="p-4 space-y-6">
      {/* Search Input for mobile */}
      <div className="relative">
        <FlameInput
          type="text"
          placeholder="Поиск людей и каналов..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-12"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      </div>

      {!searchQuery.trim() ? (
        <GlassCard className="text-center py-12">
          <Search className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">Поиск</h3>
          <p className="text-muted-foreground">
            Введите запрос для поиска каналов и людей
          </p>
        </GlassCard>
      ) : loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground mt-4">Поиск...</p>
        </div>
      ) : (
        <>
          {/* Channels Results */}
          {channels.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Каналы
              </h3>
              <div className="space-y-2">
                {channels.map((channel) => (
                  <GlassCard
                    key={channel.id}
                    className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                        <Hash className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{channel.name}</h4>
                        {channel.description && (
                          <p className="text-sm text-muted-foreground truncate">
                            {channel.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* Profiles Results */}
          {profiles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Люди
              </h3>
              <div className="space-y-2">
                {profiles.filter(p => p.user_id !== user?.id).map((profile) => (
                  <GlassCard
                    key={profile.id}
                    className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => onViewProfile?.(profile.user_id)}
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        username={profile.username}
                        avatarUrl={profile.avatar_url}
                        size="md"
                      />
                      <div className="flex-1">
                        <h4 className="font-medium">
                          {profile.username || "Без имени"}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Нажмите для просмотра профиля
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {onStartChat && (
                          <FlameButton
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartChat(profile.user_id);
                            }}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </FlameButton>
                        )}
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {channels.length === 0 && profiles.length === 0 && (
            <GlassCard className="text-center py-12">
              <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-semibold mb-2">Ничего не найдено</h3>
              <p className="text-muted-foreground">
                Попробуйте изменить запрос
              </p>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}
