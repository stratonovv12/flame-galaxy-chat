import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameInput } from "@/components/ui/FlameInput";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { Search, Hash, MessageCircle, User, Users, ChevronRight, UserPlus, LogIn, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  handle: string | null;
  avatar_url: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  handle: string | null;
  avatar_url: string | null;
}

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
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
  onOpenChannel?: (channelId: string) => void;
  onOpenGroup?: (groupId: string) => void;
}

export function SearchView({ searchQuery, onSearchChange, onStartChat, onViewProfile, onOpenChannel, onOpenGroup }: SearchViewProps) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [myGroups, setMyGroups] = useState<Set<string>>(new Set());
  const [myChannels, setMyChannels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Channel/Group preview state
  const [previewChannel, setPreviewChannel] = useState<Channel | null>(null);
  const [previewGroup, setPreviewGroup] = useState<Group | null>(null);
  const [previewMemberCount, setPreviewMemberCount] = useState(0);

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
      supabase.from("channels").select("id, name, description, handle, avatar_url")
        .or(`name.ilike.%${cleanQuery}%,handle.ilike.%${cleanQuery}%`).limit(10),
      supabase.from("groups").select("id, name, description, handle, avatar_url")
        .or(`name.ilike.%${cleanQuery}%,handle.ilike.%${cleanQuery}%`).limit(10),
      supabase.from("profiles").select("id, username, display_name, user_id, avatar_url")
        .or(`username.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%`).limit(10),
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
    setPreviewGroup(null);
  };

  const handleSubscribeChannel = async (channelId: string) => {
    if (!user) return;
    await supabase.from("channel_subscribers").upsert({ channel_id: channelId, user_id: user.id }, { onConflict: "channel_id,user_id" });
    setMyChannels(prev => new Set([...prev, channelId]));
    toast({ title: "Вы подписались на канал!" });
    setPreviewChannel(null);
  };

  const openChannelPreview = async (channel: Channel) => {
    const { count } = await supabase.from("channel_subscribers").select("*", { count: "exact", head: true }).eq("channel_id", channel.id);
    setPreviewMemberCount(count || 0);
    setPreviewChannel(channel);
  };

  const openGroupPreview = async (group: Group) => {
    const { count } = await supabase.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", group.id);
    setPreviewMemberCount(count || 0);
    setPreviewGroup(group);
  };

  // Channel preview overlay
  if (previewChannel) {
    return (
      <div className="p-4 space-y-6">
        <button onClick={() => setPreviewChannel(null)} className="text-sm text-primary hover:underline">← Назад к поиску</button>
        <GlassCard className="p-6 text-center" glow>
          <div className="flex flex-col items-center gap-4">
            {previewChannel.avatar_url ? (
              <img src={previewChannel.avatar_url} alt={previewChannel.name} className="w-20 h-20 rounded-2xl object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center">
                <Hash className="w-10 h-10 text-primary" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{previewChannel.name}</h2>
              {previewChannel.handle && <p className="text-sm text-primary/70">@{previewChannel.handle}</p>}
              <p className="text-sm text-muted-foreground mt-1">{previewMemberCount} подписчиков</p>
            </div>
            {previewChannel.description && <p className="text-sm text-muted-foreground max-w-sm">{previewChannel.description}</p>}
            {myChannels.has(previewChannel.id) ? (
              <span className="text-sm text-muted-foreground px-4 py-2 rounded-full bg-muted/50">Вы уже подписаны</span>
            ) : (
              <FlameButton onClick={() => handleSubscribeChannel(previewChannel.id)} className="w-full max-w-xs">
                <LogIn className="w-4 h-4 mr-2" /> Подписаться на канал
              </FlameButton>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

  // Group preview overlay
  if (previewGroup) {
    return (
      <div className="p-4 space-y-6">
        <button onClick={() => setPreviewGroup(null)} className="text-sm text-primary hover:underline">← Назад к поиску</button>
        <GlassCard className="p-6 text-center" glow>
          <div className="flex flex-col items-center gap-4">
            {previewGroup.avatar_url ? (
              <img src={previewGroup.avatar_url} alt={previewGroup.name} className="w-20 h-20 rounded-2xl object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-accent/20 flex items-center justify-center">
                <Users className="w-10 h-10 text-accent" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{previewGroup.name}</h2>
              {previewGroup.handle && <p className="text-sm text-primary/70">@{previewGroup.handle}</p>}
              <p className="text-sm text-muted-foreground mt-1">{previewMemberCount} участников</p>
            </div>
            {previewGroup.description && <p className="text-sm text-muted-foreground max-w-sm">{previewGroup.description}</p>}
            {myGroups.has(previewGroup.id) ? (
              <span className="text-sm text-muted-foreground px-4 py-2 rounded-full bg-muted/50">Вы уже участник</span>
            ) : (
              <FlameButton onClick={() => handleJoinGroup(previewGroup.id)} className="w-full max-w-xs">
                <UserPlus className="w-4 h-4 mr-2" /> Вступить в группу
              </FlameButton>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

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
                      {channel.avatar_url ? (
                        <img src={channel.avatar_url} alt={channel.name} className="w-10 h-10 rounded-xl object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                          <Hash className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium">{channel.name}</h4>
                        {channel.handle && <p className="text-xs text-primary/70">@{channel.handle}</p>}
                        {channel.description && <p className="text-sm text-muted-foreground truncate">{channel.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <FlameButton size="sm" variant="outline" onClick={() => openChannelPreview(channel)}>
                          <Eye className="w-4 h-4 mr-1" /> Открыть
                        </FlameButton>
                        {!myChannels.has(channel.id) && (
                          <FlameButton size="sm" onClick={() => handleSubscribeChannel(channel.id)}>
                            <LogIn className="w-4 h-4" />
                          </FlameButton>
                        )}
                      </div>
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
                      {group.avatar_url ? (
                        <img src={group.avatar_url} alt={group.name} className="w-10 h-10 rounded-xl object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                          <Users className="w-5 h-5 text-accent" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium">{group.name}</h4>
                        {group.handle && <p className="text-xs text-primary/70">@{group.handle}</p>}
                        {group.description && <p className="text-sm text-muted-foreground truncate">{group.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <FlameButton size="sm" variant="outline" onClick={() => openGroupPreview(group)}>
                          <Eye className="w-4 h-4 mr-1" /> Открыть
                        </FlameButton>
                        {!myGroups.has(group.id) && (
                          <FlameButton size="sm" onClick={() => handleJoinGroup(group.id)}>
                            <UserPlus className="w-4 h-4" />
                          </FlameButton>
                        )}
                      </div>
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
                      <UserAvatar username={profile.display_name || profile.username} avatarUrl={profile.avatar_url} size="md" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-medium">{profile.display_name || profile.username || "Без имени"}</h4>
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
