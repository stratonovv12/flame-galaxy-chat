import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameInput } from "@/components/ui/FlameInput";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { Search, Hash, MessageCircle, User, Users, ChevronRight, UserPlus, LogIn } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  handle: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  handle: string | null;
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
  onJoinGroup?: (groupId: string) => void;
  onSubscribeChannel?: (channelId: string) => void;
}

export function SearchView({ searchQuery, onSearchChange, onStartChat, onViewProfile }: SearchViewProps) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [myGroups, setMyGroups] = useState<Set<string>>(new Set());
  const [myChannels, setMyChannels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) fetchMemberships();
  }, [user]);

  useEffect(() => {
    if (searchQuery.trim()) performSearch(searchQuery);
    else { setChannels([]); setGroups([]); setProfiles([]); }
  }, [searchQuery]);

  const fetchMemberships = async () => {
    if (!user) return;
    const [{ data: gm }, { data: cs }] = await Promise.all([
      supabase.from("group_members").select("group_id").eq("user_id", user.id),
      supabase.from("channel_subscribers").select("channel_id").eq("user_id", user.id),
    ]);
    setMyGroups(new Set(gm?.map(m => m.group_id) || []));
    setMyChannels(new Set(cs?.map(s => s.channel_id) || []));
  };

  const escapePattern = (str: string) => str.replace(/[%_\\]/g, '\\$&');

  const performSearch = async (query: string) => {
    setLoading(true);
    const cleanQuery = escapePattern(query.replace(/^@/, ""));
    if (cleanQuery.length < 2) { setChannels([]); setGroups([]); setProfiles([]); setLoading(false); return; }
    const [channelsResult, groupsResult, profilesResult] = await Promise.all([
      supabase.from("channels").select("id, name, description, handle")
        .or(`name.ilike.%${cleanQuery}%,handle.ilike.%${cleanQuery}%`).limit(10),
      supabase.from("groups").select("id, name, description, handle")
        .or(`name.ilike.%${cleanQuery}%,handle.ilike.%${cleanQuery}%`).limit(10),
      supabase.from("profiles").select("id, username, user_id, avatar_url")
        .ilike("username", `%${cleanQuery}%`).limit(10),
    ]);
    setChannels(channelsResult.data || []);
    setGroups(groupsResult.data || []);
    setProfiles(profilesResult.data || []);
    setLoading(false);
  };

  const handleJoinGroup = async (groupId: string) => {
    if (!user) return;
    await supabase.from("group_members").upsert({ group_id: groupId, user_id: user.id }, { onConflict: "group_id,user_id" });
    setMyGroups(prev => new Set([...prev, groupId]));
    toast({ title: "Вы вступили в группу!" });
  };

  const handleSubscribeChannel = async (channelId: string) => {
    if (!user) return;
    await supabase.from("channel_subscribers").upsert({ channel_id: channelId, user_id: user.id }, { onConflict: "channel_id,user_id" });
    setMyChannels(prev => new Set([...prev, channelId]));
    toast({ title: "Вы подписались на канал!" });
  };

  return (
    <div className="p-4 space-y-6">
      <div className="relative">
        <FlameInput
          type="text"
          placeholder="Поиск по @имени, каналам, группам..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-12"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      </div>

      {!searchQuery.trim() ? (
        <GlassCard className="text-center py-12">
          <Search className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">Поиск</h3>
          <p className="text-muted-foreground">Введите @имя, название канала или группы</p>
        </GlassCard>
      ) : loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <>
          {channels.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Hash className="w-4 h-4" /> Каналы
              </h3>
              <div className="space-y-2">
                {channels.map(channel => (
                  <GlassCard key={channel.id} className="p-4 hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                        <Hash className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{channel.name}</h4>
                        {channel.handle && <p className="text-xs text-primary/70">@{channel.handle}</p>}
                        {channel.description && <p className="text-sm text-muted-foreground truncate">{channel.description}</p>}
                      </div>
                      {myChannels.has(channel.id) ? (
                        <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted/50">Подписан</span>
                      ) : (
                        <FlameButton size="sm" onClick={() => handleSubscribeChannel(channel.id)}>
                          <LogIn className="w-4 h-4 mr-1" /> Подписаться
                        </FlameButton>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {groups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" /> Группы
              </h3>
              <div className="space-y-2">
                {groups.map(group => (
                  <GlassCard key={group.id} className="p-4 hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-accent" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{group.name}</h4>
                        {group.handle && <p className="text-xs text-primary/70">@{group.handle}</p>}
                        {group.description && <p className="text-sm text-muted-foreground truncate">{group.description}</p>}
                      </div>
                      {myGroups.has(group.id) ? (
                        <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted/50">Участник</span>
                      ) : (
                        <FlameButton size="sm" onClick={() => handleJoinGroup(group.id)}>
                          <UserPlus className="w-4 h-4 mr-1" /> Вступить
                        </FlameButton>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {profiles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <User className="w-4 h-4" /> Люди
              </h3>
              <div className="space-y-2">
                {profiles.filter(p => p.user_id !== user?.id).map(profile => (
                  <GlassCard key={profile.id} className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => onViewProfile?.(profile.user_id)}>
                    <div className="flex items-center gap-3">
                      <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} size="md" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-medium">{profile.username || "Без имени"}</h4>
                          <UserBadge userId={profile.user_id} />
                        </div>
                        {profile.username && <p className="text-xs text-primary/70">@{profile.username.replace(/^@/, "")}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {onStartChat && (
                          <FlameButton size="sm" onClick={e => { e.stopPropagation(); onStartChat(profile.user_id); }}>
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

          {channels.length === 0 && groups.length === 0 && profiles.length === 0 && (
            <GlassCard className="text-center py-12">
              <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-semibold mb-2">Ничего не найдено</h3>
              <p className="text-muted-foreground">Попробуйте изменить запрос</p>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}
