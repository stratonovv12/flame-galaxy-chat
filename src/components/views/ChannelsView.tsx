import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { MessageReactions } from "@/components/ui/MessageReactions";
import { MediaUpload } from "@/components/ui/MediaUpload";
import { MessageContextMenu } from "@/components/ui/MessageContextMenu";
import { Hash, Plus, Send, X, LogOut, ArrowLeft, Settings, Trash2, Crown, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  handle: string | null;
  creator_id: string;
  created_at: string;
}

interface Post {
  id: string;
  content: string;
  media_url: string | null;
  author_id: string;
  created_at: string;
  profiles?: { username: string | null; avatar_url: string | null } | null;
}

interface ChannelMember {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
}

interface ChannelsViewProps {
  onViewProfile?: (userId: string) => void;
  initialChannelId?: string | null;
  onClearInitial?: () => void;
}

export function ChannelsView({ onViewProfile, initialChannelId, onClearInitial }: ChannelsViewProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "ru" ? ru : enUS;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [newPost, setNewPost] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelHandle, setNewChannelHandle] = useState("");
  const [newChannelAvatar, setNewChannelAvatar] = useState("");
  const [loading, setLoading] = useState(false);
  const [myChannelIds, setMyChannelIds] = useState<Set<string>>(new Set());

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [subscribers, setSubscribers] = useState<ChannelMember[]>([]);
  const [channelAdmins, setChannelAdmins] = useState<Set<string>>(new Set());
  const [transferTarget, setTransferTarget] = useState<string | null>(null);

  useEffect(() => { fetchMyChannels(); }, [user]);

  // Auto-open channel from search
  useEffect(() => {
    if (!initialChannelId) return;
    const target = channels.find(c => c.id === initialChannelId);
    if (target) {
      setSelectedChannel(target);
      onClearInitial?.();
    } else if (channels.length > 0 || myChannelIds.size > 0) {
      fetchMyChannels();
    }
  }, [initialChannelId, channels]);

  useEffect(() => {
    if (selectedChannel) {
      fetchPosts(selectedChannel.id);
      subscribeToChannel(selectedChannel.id);
      fetchHiddenMessages();

      const channel = supabase
        .channel("posts-realtime")
        .on("postgres_changes", {
          event: "*", schema: "public", table: "posts",
          filter: `channel_id=eq.${selectedChannel.id}`,
        }, (payload) => {
          if (payload.eventType === "DELETE") {
            setPosts((prev) => prev.filter((p) => p.id !== (payload.old as any).id));
          } else {
            fetchPosts(selectedChannel.id);
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedChannel]);

  const fetchMyChannels = async () => {
    if (!user) return;
    const { data: subs } = await supabase.from("channel_subscribers").select("channel_id").eq("user_id", user.id);
    const ids = new Set(subs?.map((s) => s.channel_id) || []);
    setMyChannelIds(ids);
    const { data: created } = await supabase.from("channels").select("id").eq("creator_id", user.id);
    created?.forEach((c) => ids.add(c.id));
    if (ids.size === 0) { setChannels([]); return; }
    const { data } = await supabase.from("channels").select("*").in("id", Array.from(ids)).order("created_at", { ascending: false });
    setChannels(data || []);
    if (data && data.length > 0) {
      const counts: Record<string, number> = {};
      for (const c of data) {
        const { count } = await supabase.from("channel_subscribers").select("*", { count: "exact", head: true }).eq("channel_id", c.id);
        counts[c.id] = count || 0;
      }
      setSubscriberCounts(counts);
    }
  };

  const fetchHiddenMessages = async () => {
    if (!user) return;
    const { data } = await supabase.from("hidden_messages").select("message_id").eq("user_id", user.id).eq("message_type", "channel");
    setHiddenIds(new Set(data?.map((h) => h.message_id) || []));
  };

  const subscribeToChannel = async (channelId: string) => {
    if (!user) return;
    await supabase.from("channel_subscribers").upsert({ channel_id: channelId, user_id: user.id }, { onConflict: "channel_id,user_id" });
  };

  const leaveChannel = async () => {
    if (!user || !selectedChannel) return;
    await supabase.from("channel_subscribers").delete().eq("channel_id", selectedChannel.id).eq("user_id", user.id);
    toast({ title: t("unsubscribed") });
    setSelectedChannel(null);
    fetchMyChannels();
  };

  const fetchPosts = async (channelId: string) => {
    const { data: postsData } = await supabase.from("posts").select("*").eq("channel_id", channelId).order("created_at", { ascending: true });
    if (!postsData) return;
    const authorIds = [...new Set(postsData.map((p) => p.author_id))];
    if (authorIds.length > 0) {
      const { data: profilesData } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", authorIds);
      const profilesMap = new Map(profilesData?.map((p) => [p.user_id, { username: p.username, avatar_url: p.avatar_url }]) || []);
      setPosts(postsData.map((p) => ({ ...p, profiles: profilesMap.get(p.author_id) || null })));
    } else {
      setPosts(postsData);
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !user) return;
    setLoading(true);
    const { error } = await supabase.from("channels").insert({
      name: newChannelName.trim(), description: newChannelDesc.trim() || null,
      avatar_url: newChannelAvatar.trim() || null, handle: newChannelHandle.trim().replace(/^@/, "") || null,
      creator_id: user.id,
    });
    if (error) {
      toast({ title: t("error"), description: error.message?.includes("handle") ? t("handleTaken") : t("failedToCreate"), variant: "destructive" });
    } else {
      toast({ title: t("channelCreated") });
      setNewChannelName(""); setNewChannelDesc(""); setNewChannelAvatar(""); setNewChannelHandle(""); setShowCreateModal(false);
      fetchMyChannels();
    }
    setLoading(false);
  };

  const sendPost = async () => {
    if ((!newPost.trim() && !mediaUrl) || !selectedChannel || !user) return;
    if (selectedChannel.creator_id !== user.id) {
      toast({ title: t("restriction"), description: t("onlyCreatorCanPost"), variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("posts").insert({
      content: newPost.trim() || (mediaUrl ? "📎 Медиа" : ""),
      media_url: mediaUrl || null, channel_id: selectedChannel.id, author_id: user.id,
    });
    if (error) {
      toast({ title: t("error"), description: t("sendFailed"), variant: "destructive" });
    } else {
      setNewPost(""); setMediaUrl("");
    }
  };

  const fetchSubscribers = async (channelId: string) => {
    const { data: subData } = await supabase.from("channel_subscribers").select("user_id").eq("channel_id", channelId);
    if (!subData) return;
    const userIds = subData.map(s => s.user_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", userIds);
    setSubscribers(profiles?.map(p => ({ user_id: p.user_id, username: p.username, avatar_url: p.avatar_url })) || []);
    
    const { data: admins } = await supabase.from("channel_admins").select("user_id").eq("channel_id", channelId);
    setChannelAdmins(new Set(admins?.map(a => a.user_id) || []));
  };

  const openSettings = () => {
    if (!selectedChannel) return;
    fetchSubscribers(selectedChannel.id);
    setShowSettings(true);
  };

  const toggleAdmin = async (userId: string) => {
    if (!selectedChannel || !user) return;
    if (channelAdmins.has(userId)) {
      await supabase.from("channel_admins").delete().eq("channel_id", selectedChannel.id).eq("user_id", userId);
      setChannelAdmins(prev => { const n = new Set(prev); n.delete(userId); return n; });
      toast({ title: t("adminRightsRemoved") });
    } else {
      await supabase.from("channel_admins").insert({ channel_id: selectedChannel.id, user_id: userId, appointed_by: user.id });
      setChannelAdmins(prev => new Set([...prev, userId]));
      toast({ title: t("appointedAdmin") });
    }
  };

  const transferOwnership = async () => {
    if (!selectedChannel || !transferTarget || !user) return;
    if (!confirm(t("transferConfirmMsg"))) return;
    await supabase.from("channels").update({ creator_id: transferTarget }).eq("id", selectedChannel.id);
    setSelectedChannel({ ...selectedChannel, creator_id: transferTarget });
    setTransferTarget(null);
    toast({ title: t("ownershipTransferred") });
  };

  const deleteChannel = async () => {
    if (!selectedChannel) return;
    if (!confirm(t("deleteChannelConfirm"))) return;
    await supabase.from("channels").delete().eq("id", selectedChannel.id);
    toast({ title: t("channelDeleted") });
    setSelectedChannel(null);
    setShowSettings(false);
    fetchMyChannels();
  };

  const isCreator = selectedChannel && user && selectedChannel.creator_id === user.id;

  // Verified channels cache
  const [verifiedChannelIds, setVerifiedChannelIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from("verified_channels").select("channel_id").then(({ data }) => {
      setVerifiedChannelIds(new Set(data?.map(v => v.channel_id) || []));
    });
  }, []);

  const ChannelIcon = ({ channel, size = "md" }: { channel: Channel; size?: "sm" | "md" | "lg" }) => {
    const sizeClasses = { sm: "w-10 h-10", md: "w-10 h-10", lg: "w-12 h-12" };
    if (channel.avatar_url) {
      return <img src={channel.avatar_url} alt={channel.name} className={`${sizeClasses[size]} rounded-xl object-cover`} />;
    }
    return (
      <div className={`${sizeClasses[size]} rounded-xl bg-primary/20 flex items-center justify-center`}>
        <Hash className="w-5 h-5 text-primary" />
      </div>
    );
  };

  const VerifiedBadge = ({ channelId }: { channelId: string }) => {
    if (!verifiedChannelIds.has(channelId)) return null;
    return (
      <span title="Verified" className="inline-flex">
        <ShieldCheck className="w-4 h-4 text-blue-400 fill-blue-400/20" />
      </span>
    );
  };

  // Settings panel
  if (showSettings && selectedChannel) {
    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-muted/50 rounded-lg touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-semibold">{t("channelSettings")}</h2>
          </div>
        </GlassCard>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <GlassCard className="p-4">
            <h3 className="font-semibold mb-2">{selectedChannel.name}</h3>
            {selectedChannel.handle && <p className="text-sm text-primary/70 mb-3">@{selectedChannel.handle}</p>}
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Crown className="w-5 h-5 text-yellow-500" />{t("transferOwnership")}</h3>
            <p className="text-sm text-muted-foreground mb-3">{t("selectSubTransfer")}</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {subscribers.filter(s => s.user_id !== user?.id).map(s => (
                <div key={s.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                  <UserAvatar username={s.username} avatarUrl={s.avatar_url} size="sm" />
                  <span className="flex-1 text-sm font-medium">{s.username || t("user")}</span>
                  <FlameButton size="sm" variant={transferTarget === s.user_id ? "primary" : "outline"}
                    onClick={() => setTransferTarget(transferTarget === s.user_id ? null : s.user_id)}>
                    {t("transfer")}
                  </FlameButton>
                </div>
              ))}
            </div>
            {transferTarget && (
              <FlameButton onClick={transferOwnership} className="w-full mt-3">
                {t("confirmTransfer")}
              </FlameButton>
            )}
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />{t("administrators")}</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {subscribers.filter(s => s.user_id !== user?.id).map(s => (
                <div key={s.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                  <UserAvatar username={s.username} avatarUrl={s.avatar_url} size="sm" />
                  <span className="flex-1 text-sm font-medium">{s.username || t("user")}</span>
                  <button onClick={() => toggleAdmin(s.user_id)}
                    className={`p-2 rounded-lg transition-colors ${channelAdmins.has(s.user_id) ? "bg-primary/20 text-primary" : "hover:bg-muted/50 text-muted-foreground"}`}>
                    <ShieldCheck className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </GlassCard>

          <FlameButton onClick={deleteChannel} variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4 mr-2" /> {t("deleteChannel")}
          </FlameButton>
        </div>
      </div>
    );
  }

  if (selectedChannel) {
    const visiblePosts = posts.filter((p) => !hiddenIds.has(p.id));

    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedChannel(null)} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <ChannelIcon channel={selectedChannel} />
            <div className="flex-1">
              <h2 className="font-semibold flex items-center gap-1">
                {selectedChannel.name}
                <VerifiedBadge channelId={selectedChannel.id} />
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedChannel.handle && <span className="text-primary/70">@{selectedChannel.handle} · </span>}
                {subscriberCounts[selectedChannel.id] || 0} {t("subscribers")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {isCreator && (
                <button onClick={openSettings} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target" title={t("settings")}>
                  <Settings className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
              {!isCreator && (
                <button onClick={leaveChannel} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors touch-target" title={t("unsubscribe")}>
                  <LogOut className="w-5 h-5 text-destructive" />
                </button>
              )}
            </div>
          </div>
        </GlassCard>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {visiblePosts.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Hash className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("noPostsYet")}</p>
            </div>
          ) : (
            visiblePosts.map((post) => (
              <GlassCard key={post.id} className="p-3 group">
                <div className="flex items-start gap-3">
                  <button onClick={() => onViewProfile?.(post.author_id)} className="shrink-0">
                    <UserAvatar username={post.profiles?.username} avatarUrl={post.profiles?.avatar_url} size="sm" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{post.profiles?.username || t("user")}</span>
                      <UserBadge userId={post.author_id} />
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: dateLocale })}
                      </span>
                    </div>
                    {post.media_url && (
                      post.media_url.match(/\.(mp4|webm|mov)/) ? (
                        <video src={post.media_url} controls className="mt-2 max-h-64 rounded-lg" />
                      ) : (
                        <img src={post.media_url} alt="" className="mt-2 max-h-64 rounded-lg object-cover cursor-pointer" onClick={() => window.open(post.media_url!, "_blank")} />
                      )
                    )}
                    {post.content && post.content !== "📎 Медиа" && <p className="mt-1 text-sm break-words">{post.content}</p>}
                    <MessageReactions postId={post.id} className="mt-2" />
                  </div>
                  {isCreator && (
                    <MessageContextMenu
                      messageId={post.id} messageType="channel" isSender={true}
                      onDeleted={() => setPosts((prev) => prev.filter((p) => p.id !== post.id))}
                      onHidden={() => setHiddenIds((prev) => new Set([...prev, post.id]))}
                    />
                  )}
                </div>
              </GlassCard>
            ))
          )}
        </div>

        {isCreator && (
          <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
            <div className="flex items-end gap-2">
              <MediaUpload onUpload={setMediaUrl} />
              <FlameInput placeholder={t("writePublication")} value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendPost()} className="flex-1" />
              <FlameButton onClick={sendPost} size="md"><Send className="w-5 h-5" /></FlameButton>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t("channels")}</h2>
        <FlameButton onClick={() => setShowCreateModal(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" /> {t("create")}
        </FlameButton>
      </div>

      {channels.length === 0 ? (
        <GlassCard className="text-center py-12">
          <Hash className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">{t("noSubscriptions")}</h3>
          <p className="text-muted-foreground mb-4">{t("findChannelsHint")}</p>
          <FlameButton onClick={() => setShowCreateModal(true)}><Plus className="w-4 h-4 mr-2" /> {t("createChannel")}</FlameButton>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {channels.map((channel) => (
            <GlassCard key={channel.id} className="p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedChannel(channel)}>
              <div className="flex items-center gap-3">
                <ChannelIcon channel={channel} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold flex items-center gap-1">
                    {channel.name}
                    <VerifiedBadge channelId={channel.id} />
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {channel.handle && <span className="text-primary/70">@{channel.handle} · </span>}
                    {subscriberCounts[channel.id] || 0} подписчиков
                  </p>
                  {channel.description && <p className="text-sm text-muted-foreground truncate">{channel.description}</p>}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md p-6" glow>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Создать канал</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-muted/50 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-center">
                <AvatarUpload currentUrl={newChannelAvatar} onUpload={setNewChannelAvatar} folder="channels" />
              </div>
              <FlameInput label="Название" placeholder="Например: Общение" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
              <FlameInput label="@Хендл" placeholder="unique_handle" value={newChannelHandle} onChange={(e) => setNewChannelHandle(e.target.value)} />
              <FlameInput label="Описание" placeholder="О чём этот канал?" value={newChannelDesc} onChange={(e) => setNewChannelDesc(e.target.value)} />
              <FlameButton onClick={createChannel} className="w-full" disabled={!newChannelName.trim() || loading}>
                {loading ? "Создание..." : "Создать канал"}
              </FlameButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
