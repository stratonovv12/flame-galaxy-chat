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
import { VoiceRecorder } from "@/components/ui/VoiceRecorder";
import { MessageContextMenu } from "@/components/ui/MessageContextMenu";
import { UploadingBubble } from "@/components/ui/UploadingBubble";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { Users, Plus, Send, X, ArrowLeft, LogOut, Reply, Settings, Trash2, Crown, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { playNotificationSound, showBrowserNotification } from "@/lib/notifications";

interface Group {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  handle: string | null;
  creator_id: string;
  created_at: string;
}

interface GroupMessage {
  id: string;
  content: string;
  media_url: string | null;
  author_id: string;
  created_at: string;
  reply_to_id: string | null;
  forwarded_from: string | null;
  profiles?: { username: string | null; avatar_url: string | null } | null;
}

interface GroupMember {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
}

interface GroupsViewProps {
  onViewProfile?: (userId: string) => void;
  initialGroupId?: string | null;
  onClearInitial?: () => void;
}

export function GroupsView({ onViewProfile, initialGroupId, onClearInitial }: GroupsViewProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "ru" ? ru : enUS;
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [newMessage, setNewMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [newAvatar, setNewAvatar] = useState("");
  const [loading, setLoading] = useState(false);
  const [myGroupIds, setMyGroupIds] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const { pendingUploads, startUpload, cancelUpload } = useMediaUpload();

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupAdmins, setGroupAdmins] = useState<Set<string>>(new Set());
  const [transferTarget, setTransferTarget] = useState<string | null>(null);

  useEffect(() => { fetchMyGroups(); }, [user]);

  // Auto-open group from search
  useEffect(() => {
    if (!initialGroupId) return;
    const target = groups.find(g => g.id === initialGroupId);
    if (target) {
      setSelectedGroup(target);
      onClearInitial?.();
    } else if (groups.length > 0 || myGroupIds.size > 0) {
      // Group not in list yet, refetch (user may have just joined)
      fetchMyGroups().then(() => {
        // Will be caught by next render cycle
      });
    }
  }, [initialGroupId, groups]);

  useEffect(() => {
    if (selectedGroup) {
      fetchMessages(selectedGroup.id);
      fetchHiddenMessages();

      const channel = supabase
        .channel(`group-msgs-${selectedGroup.id}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "group_messages",
          filter: `group_id=eq.${selectedGroup.id}`,
        }, (payload) => {
          if (payload.eventType === "DELETE") {
            setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
          } else {
            const newMsg = payload.new as any;
            if (newMsg.author_id !== user?.id) {
              playNotificationSound();
              showBrowserNotification(selectedGroup.name, newMsg.content);
            }
            fetchMessages(selectedGroup.id);
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedGroup]);

  const fetchMyGroups = async () => {
    if (!user) return;
    const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
    const ids = new Set(memberships?.map(m => m.group_id) || []);
    setMyGroupIds(ids);

    if (ids.size === 0) { setGroups([]); return; }
    const { data } = await supabase.from("groups").select("*").in("id", Array.from(ids)).order("created_at", { ascending: false });
    setGroups(data || []);

    if (data && data.length > 0) {
      const counts: Record<string, number> = {};
      for (const g of data) {
        const { count } = await supabase.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", g.id);
        counts[g.id] = count || 0;
      }
      setMemberCounts(counts);
    }
  };

  const fetchHiddenMessages = async () => {
    if (!user) return;
    const { data } = await supabase.from("hidden_messages").select("message_id").eq("user_id", user.id).eq("message_type", "group");
    setHiddenIds(new Set(data?.map(h => h.message_id) || []));
  };

  const fetchMembers = async (groupId: string) => {
    const { data: memberData } = await supabase.from("group_members").select("user_id").eq("group_id", groupId);
    if (!memberData) return;
    const userIds = memberData.map(m => m.user_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", userIds);
    setMembers(profiles?.map(p => ({ user_id: p.user_id, username: p.username, avatar_url: p.avatar_url })) || []);
    
    const { data: admins } = await supabase.from("group_admins").select("user_id").eq("group_id", groupId);
    setGroupAdmins(new Set(admins?.map(a => a.user_id) || []));
  };

  const openSettings = () => {
    if (!selectedGroup) return;
    fetchMembers(selectedGroup.id);
    setShowSettings(true);
  };

  const toggleAdmin = async (userId: string) => {
    if (!selectedGroup || !user) return;
    if (groupAdmins.has(userId)) {
      await supabase.from("group_admins").delete().eq("group_id", selectedGroup.id).eq("user_id", userId);
      setGroupAdmins(prev => { const n = new Set(prev); n.delete(userId); return n; });
      toast({ title: t("adminRightsRemoved") });
    } else {
      await supabase.from("group_admins").insert({ group_id: selectedGroup.id, user_id: userId, appointed_by: user.id });
      setGroupAdmins(prev => new Set([...prev, userId]));
      toast({ title: t("appointedAdmin") });
    }
  };

  const kickMember = async (userId: string) => {
    if (!selectedGroup || !user) return;
    if (!confirm(t("kickConfirm"))) return;
    await supabase.from("group_members").delete().eq("group_id", selectedGroup.id).eq("user_id", userId);
    await supabase.from("group_admins").delete().eq("group_id", selectedGroup.id).eq("user_id", userId);
    setMembers(prev => prev.filter(m => m.user_id !== userId));
    setGroupAdmins(prev => { const n = new Set(prev); n.delete(userId); return n; });
    toast({ title: t("memberKicked") });
  };

  const transferOwnership = async () => {
    if (!selectedGroup || !transferTarget || !user) return;
    if (!confirm(t("transferConfirmMsg"))) return;
    await supabase.from("groups").update({ creator_id: transferTarget }).eq("id", selectedGroup.id);
    setSelectedGroup({ ...selectedGroup, creator_id: transferTarget });
    setTransferTarget(null);
    toast({ title: t("ownershipTransferred") });
  };

  const deleteGroup = async () => {
    if (!selectedGroup) return;
    if (!confirm(t("deleteGroupConfirm"))) return;
    await supabase.from("groups").delete().eq("id", selectedGroup.id);
    toast({ title: t("groupDeleted") });
    setSelectedGroup(null);
    setShowSettings(false);
    fetchMyGroups();
  };

  const leaveGroup = async () => {
    if (!user || !selectedGroup) return;
    await supabase.from("group_members").delete().eq("group_id", selectedGroup.id).eq("user_id", user.id);
    toast({ title: t("leftGroup") });
    setSelectedGroup(null);
    fetchMyGroups();
  };

  const fetchMessages = async (groupId: string) => {
    const { data: msgs } = await supabase
      .from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true });
    if (!msgs) return;

    const authorIds = [...new Set(msgs.map(m => m.author_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", authorIds);
    const profilesMap = new Map(profiles?.map(p => [p.user_id, { username: p.username, avatar_url: p.avatar_url }]) || []);
    setMessages(msgs.map(m => ({ ...m, profiles: profilesMap.get(m.author_id) || null })));
  };

  const createGroup = async () => {
    if (!newName.trim() || !user) return;
    setLoading(true);
    const { data: newGroup, error } = await supabase.from("groups").insert({
      name: newName.trim(), description: newDesc.trim() || null,
      avatar_url: newAvatar.trim() || null, handle: newHandle.trim().replace(/^@/, "") || null,
      creator_id: user.id,
    }).select().single();
    if (error) {
      toast({ title: t("error"), description: error.message?.includes("handle") ? t("handleTaken") : t("failedToCreate"), variant: "destructive" });
    } else {
      if (newGroup) {
        await supabase.from("group_members").upsert({ group_id: newGroup.id, user_id: user.id }, { onConflict: "group_id,user_id" });
      }
      toast({ title: t("groupCreated") });
      setNewName(""); setNewDesc(""); setNewAvatar(""); setNewHandle(""); setShowCreate(false);
      fetchMyGroups();
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !mediaUrl) || !selectedGroup || !user) return;
    const { error } = await supabase.from("group_messages").insert({
      content: newMessage.trim() || (mediaUrl ? "📎 Медиа" : ""),
      media_url: mediaUrl || null, group_id: selectedGroup.id,
      author_id: user.id, reply_to_id: replyTo?.id || null,
    });
    if (error) {
      toast({ title: t("error"), description: t("sendFailed"), variant: "destructive" });
    } else {
      setNewMessage(""); setMediaUrl(""); setReplyTo(null);
    }
  };

  const handleVoiceRecorded = (blob: Blob, _durationSec: number) => {
    if (!selectedGroup || !user) return;
    startUpload(blob, "voice", async (url) => {
      await supabase.from("group_messages").insert({
        content: "🎤 Голосовое сообщение", media_url: url,
        group_id: selectedGroup.id, author_id: user.id,
      });
    });
  };

  // Removed video recorder

  const getReplyPreview = (replyId: string) => {
    const msg = messages.find(m => m.id === replyId);
    return msg ? msg.content.slice(0, 60) : null;
  };

  const renderMedia = (url: string) => {
    if (url.includes("_circle")) {
      return <video src={url} controls playsInline className="w-48 h-48 rounded-full object-cover mt-2 border-2 border-primary" style={{ aspectRatio: "1/1" }} />;
    }
    if (url.includes("_voice")) {
      return <audio src={url} controls className="mt-2 max-w-full" />;
    }
    if (url.match(/\.(mp4|mov|webm)$/)) {
      return <video src={url} controls playsInline className="mt-2 max-h-64 rounded-lg" />;
    }
    return <img src={url} alt="" className="mt-2 max-h-64 rounded-lg object-cover cursor-pointer" onClick={() => window.open(url, "_blank")} />;
  };

  const isCreator = selectedGroup && user && selectedGroup.creator_id === user.id;

  // Settings panel
  if (showSettings && selectedGroup) {
    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-muted/50 rounded-lg touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-semibold">{t("groupSettings")}</h2>
          </div>
        </GlassCard>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <GlassCard className="p-4">
            <h3 className="font-semibold mb-2">{selectedGroup.name}</h3>
            {selectedGroup.handle && <p className="text-sm text-primary/70 mb-3">@{selectedGroup.handle}</p>}
          </GlassCard>

          {isCreator && (
            <>
              <GlassCard className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Crown className="w-5 h-5 text-yellow-500" />{t("transferOwnership")}</h3>
                <p className="text-sm text-muted-foreground mb-3">{t("selectMemberTransfer")}</p>
                <div className="space-y-2">
                  {members.filter(m => m.user_id !== user?.id).map(m => (
                    <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                      <UserAvatar username={m.username} avatarUrl={m.avatar_url} size="sm" />
                      <span className="flex-1 text-sm font-medium">{m.username || t("user")}</span>
                      <FlameButton size="sm" variant={transferTarget === m.user_id ? "primary" : "outline"}
                        onClick={() => setTransferTarget(transferTarget === m.user_id ? null : m.user_id)}>
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
                <h3 className="font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />{t("manageMembers")}</h3>
                <p className="text-sm text-muted-foreground mb-3">{t("adminsCanDelete")}</p>
                <div className="space-y-2">
                  {members.filter(m => m.user_id !== user?.id).map(m => (
                    <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                      <UserAvatar username={m.username} avatarUrl={m.avatar_url} size="sm" />
                      <span className="flex-1 text-sm font-medium">{m.username || t("user")}</span>
                      <button onClick={() => toggleAdmin(m.user_id)}
                        className={`p-2 rounded-lg transition-colors ${groupAdmins.has(m.user_id) ? "bg-primary/20 text-primary" : "hover:bg-muted/50 text-muted-foreground"}`}
                        title={groupAdmins.has(m.user_id) ? t("removeAdmin") : t("appointAdmin")}>
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button onClick={() => kickMember(m.user_id)}
                        className="p-2 rounded-lg transition-colors hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                        title={t("kickMember")}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <FlameButton onClick={deleteGroup} variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4 mr-2" /> {t("deleteGroup")}
              </FlameButton>
            </>
          )}
        </div>
      </div>
    );
  }

  if (selectedGroup) {
    const visibleMessages = messages.filter(m => !hiddenIds.has(m.id));

    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedGroup(null); setReplyTo(null); }} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            {selectedGroup.avatar_url ? (
              <img src={selectedGroup.avatar_url} alt={selectedGroup.name} className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="font-semibold">{selectedGroup.name}</h2>
              <p className="text-xs text-muted-foreground">
                {selectedGroup.handle && <span className="text-primary/70">@{selectedGroup.handle} · </span>}
                {memberCounts[selectedGroup.id] || 0} {t("members")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {isCreator && (
                <button onClick={openSettings} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target" title={t("settings")}>
                  <Settings className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
              <button onClick={leaveGroup} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors touch-target" title={t("leaveGroup")}>
                <LogOut className="w-5 h-5 text-destructive" />
              </button>
            </div>
          </div>
        </GlassCard>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {visibleMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("noMessagesYet")}</p>
            </div>
          ) : (
            visibleMessages.map(msg => (
              <GlassCard key={msg.id} className="p-3 group">
                <div className="flex items-start gap-3">
                  <button onClick={() => onViewProfile?.(msg.author_id)} className="shrink-0">
                    <UserAvatar username={msg.profiles?.username} avatarUrl={msg.profiles?.avatar_url} size="sm" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{msg.profiles?.username || t("user")}</span>
                      <UserBadge userId={msg.author_id} />
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: dateLocale })}
                      </span>
                    </div>
                    {msg.forwarded_from && (
                      <p className="text-xs text-primary/70 mt-1">↪ {t("forwardedFrom")} {msg.forwarded_from}</p>
                    )}
                    {msg.reply_to_id && (
                      <div className="mt-1 pl-2 border-l-2 border-primary/50 text-xs text-muted-foreground">
                        {getReplyPreview(msg.reply_to_id) || t("message")}
                      </div>
                    )}
                    {msg.media_url && renderMedia(msg.media_url)}
                    {msg.content && msg.content !== "📎 Медиа" && msg.content !== "🎤 Голосовое сообщение" && msg.content !== "🎥 Видео-кружок" && (
                      <p className="mt-1 text-sm break-words">{msg.content}</p>
                    )}
                    <MessageReactions postId={msg.id} className="mt-2" />
                  </div>
                  <MessageContextMenu
                    messageId={msg.id} messageType="group" isSender={msg.author_id === user?.id}
                    messageContent={msg.content}
                    onDeleted={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                    onHidden={() => setHiddenIds(prev => new Set([...prev, msg.id]))}
                    onReply={() => setReplyTo(msg)}
                  />
                </div>
              </GlassCard>
            ))
          )}
          {pendingUploads.map(upload => (
            <UploadingBubble key={upload.id} upload={upload} onCancel={cancelUpload} />
          ))}
        </div>

        {replyTo && (
          <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2">
            <Reply className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 pl-2 border-l-2 border-primary">
              <p className="text-xs text-primary font-medium">{replyTo.profiles?.username || t("user")}</p>
              <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-muted/50 rounded"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
          <div className="flex items-end gap-2">
            <MediaUpload onUpload={setMediaUrl} />
            <VoiceRecorder onRecorded={handleVoiceRecorded} />
            <FlameInput placeholder={t("writeMessage")} value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()} className="flex-1" />
            <FlameButton onClick={sendMessage} size="md"><Send className="w-5 h-5" /></FlameButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Группы</h2>
        <FlameButton onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" /> Создать
        </FlameButton>
      </div>

      {groups.length === 0 ? (
        <GlassCard className="text-center py-12">
          <Users className="w-16 h-16 mx-auto mb-4 text-accent/50" />
          <h3 className="text-lg font-semibold mb-2">Нет групп</h3>
          <p className="text-muted-foreground mb-4">Найдите группы через поиск или создайте!</p>
          <FlameButton onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" /> Создать группу</FlameButton>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <GlassCard key={g.id} className="p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedGroup(g)}>
              <div className="flex items-center gap-3">
                {g.avatar_url ? (
                  <img src={g.avatar_url} alt={g.name} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                    <Users className="w-6 h-6 text-accent" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{g.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {g.handle && <span className="text-primary/70">@{g.handle} · </span>}
                    {memberCounts[g.id] || 0} участников
                  </p>
                  {g.description && <p className="text-sm text-muted-foreground truncate">{g.description}</p>}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md p-6" glow>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Создать группу</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted/50 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-center">
                <AvatarUpload currentUrl={newAvatar} onUpload={setNewAvatar} folder="groups" />
              </div>
              <FlameInput label="Название" placeholder="Название группы" value={newName} onChange={e => setNewName(e.target.value)} />
              <FlameInput label="@Хендл" placeholder="unique_handle" value={newHandle} onChange={e => setNewHandle(e.target.value)} />
              <FlameInput label="Описание" placeholder="О чём группа?" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              <FlameButton onClick={createGroup} className="w-full" disabled={!newName.trim() || loading}>
                {loading ? "Создание..." : "Создать группу"}
              </FlameButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
