import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { MediaUpload } from "@/components/ui/MediaUpload";
import { VoiceRecorder } from "@/components/ui/VoiceRecorder";
import { VideoCircleRecorder } from "@/components/ui/VideoCircleRecorder";
import { MessageContextMenu } from "@/components/ui/MessageContextMenu";
import { CallUI } from "@/components/ui/CallUI";
import { MessageCircle, Send, ArrowLeft, Phone, ShieldBan, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

interface Conversation {
  partnerId: string;
  partnerUsername: string | null;
  partnerAvatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  media_url: string | null;
  created_at: string;
}

interface DirectMessagesViewProps {
  selectedUserId?: string | null;
  onClearSelectedUser?: () => void;
  onViewProfile?: (userId: string) => void;
}

export function DirectMessagesView({ selectedUserId, onClearSelectedUser, onViewProfile }: DirectMessagesViewProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<{ id: string; username: string | null; avatarUrl: string | null } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [newMessage, setNewMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByThem, setBlockedByThem] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user) fetchConversations(); }, [user]);
  useEffect(() => { if (selectedUserId && user) openChatWithUser(selectedUserId); }, [selectedUserId, user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
          fetchConversations();
          return;
        }
        const newMsg = payload.new as Message;
        if (newMsg.sender_id === user.id || newMsg.receiver_id === user.id) {
          if (activeChat && (newMsg.sender_id === activeChat.id || newMsg.receiver_id === activeChat.id)) {
            setMessages((prev) => [...prev, newMsg]);
          }
          fetchConversations();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeChat]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (activeChat && user) {
      checkBlockStatus(activeChat.id);
      fetchHiddenMessages();
    }
  }, [activeChat, user]);

  const checkBlockStatus = async (partnerId: string) => {
    if (!user) return;
    const [{ data: blocked }, { data: blockedBy }] = await Promise.all([
      supabase.from("blocked_users").select("id").eq("blocker_id", user.id).eq("blocked_id", partnerId).maybeSingle(),
      supabase.from("blocked_users").select("id").eq("blocker_id", partnerId).eq("blocked_id", user.id).maybeSingle(),
    ]);
    setIsBlocked(!!blocked);
    setBlockedByThem(!!blockedBy);
  };

  const fetchHiddenMessages = async () => {
    if (!user) return;
    const { data } = await supabase.from("hidden_messages").select("message_id").eq("user_id", user.id).eq("message_type", "dm");
    setHiddenIds(new Set(data?.map((h) => h.message_id) || []));
  };

  const toggleBlock = async () => {
    if (!user || !activeChat) return;
    if (isBlocked) {
      await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", activeChat.id);
      toast({ title: "Пользователь разблокирован" });
    } else {
      await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: activeChat.id });
      toast({ title: "Пользователь заблокирован" });
    }
    setIsBlocked(!isBlocked);
  };

  const fetchConversations = async () => {
    if (!user) return;
    const { data: messagesData } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    const conversationsMap = new Map<string, { lastMessage: any; unread: boolean }>();
    for (const msg of messagesData || []) {
      const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, { lastMessage: msg, unread: msg.receiver_id === user.id && !msg.read_at });
      }
    }

    const partnerIds = Array.from(conversationsMap.keys());
    if (partnerIds.length === 0) { setConversations([]); return; }

    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", partnerIds);
    const profilesMap = new Map(profiles?.map((p) => [p.user_id, { username: p.username, avatar_url: p.avatar_url }]) || []);

    setConversations(Array.from(conversationsMap.entries()).map(([partnerId, data]) => {
      const profile = profilesMap.get(partnerId);
      return {
        partnerId,
        partnerUsername: profile?.username || null,
        partnerAvatarUrl: profile?.avatar_url || null,
        lastMessage: data.lastMessage.content,
        lastMessageAt: data.lastMessage.created_at,
        unread: data.unread,
      };
    }));
  };

  const openChatWithUser = async (partnerId: string) => {
    const { data: profile } = await supabase.from("profiles").select("user_id, username, avatar_url").eq("user_id", partnerId).maybeSingle();
    setActiveChat({ id: partnerId, username: profile?.username || null, avatarUrl: profile?.avatar_url || null });
    fetchMessages(partnerId);
  };

  const fetchMessages = async (partnerId: string) => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    setLoading(false);
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !mediaUrl) || !activeChat || !user) return;
    if (blockedByThem) {
      toast({ title: "Ошибка", description: "Вы заблокированы этим пользователем", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: activeChat.id,
      content: newMessage.trim() || (mediaUrl ? "📎 Медиа" : ""),
      media_url: mediaUrl || null,
    });
    if (error) {
      toast({ title: "Ошибка", description: error.message?.includes("blocked") ? "Вы заблокированы" : "Не удалось отправить", variant: "destructive" });
    } else {
      setNewMessage(""); setMediaUrl("");
    }
  };

  const handleMediaUpload = (url: string) => {
    setMediaUrl(url);
  };

  const handleVoiceRecorded = (url: string) => {
    if (!activeChat || !user) return;
    supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: activeChat.id,
      content: "🎤 Голосовое сообщение",
      media_url: url,
    }).then(({ error }) => {
      if (error) toast({ title: "Ошибка", description: "Не удалось отправить", variant: "destructive" });
    });
  };

  const handleVideoRecorded = (url: string) => {
    if (!activeChat || !user) return;
    supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: activeChat.id,
      content: "🎥 Видео-кружок",
      media_url: url,
    }).then(({ error }) => {
      if (error) toast({ title: "Ошибка", description: "Не удалось отправить", variant: "destructive" });
    });
  };

  const closeChat = () => {
    setActiveChat(null); setMessages([]); setHiddenIds(new Set()); onClearSelectedUser?.();
  };

  const renderMedia = (url: string) => {
    if (url.match(/\.(webm)$/) && url.includes("_circle")) {
      return (
        <video src={url} controls className="w-48 h-48 rounded-full object-cover mb-2 border-2 border-primary" />
      );
    }
    if (url.match(/\.webm$/) && !url.includes("_circle")) {
      return <audio src={url} controls className="mb-2 max-w-full" />;
    }
    if (url.match(/\.(mp4|mov)$/)) {
      return <video src={url} controls className="max-h-48 rounded-lg mb-2" />;
    }
    return (
      <img src={url} alt="" className="max-h-48 rounded-lg object-cover mb-2 cursor-pointer" onClick={() => window.open(url, "_blank")} />
    );
  };

  if (calling && activeChat) {
    return <CallUI partnerUsername={activeChat.username} partnerAvatarUrl={activeChat.avatarUrl} onEnd={() => setCalling(false)} />;
  }

  if (activeChat) {
    const visibleMessages = messages.filter((m) => !hiddenIds.has(m.id));

    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button onClick={closeChat} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={() => onViewProfile?.(activeChat.id)} className="shrink-0">
              <UserAvatar username={activeChat.username} avatarUrl={activeChat.avatarUrl} size="md" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold">{activeChat.username || "Пользователь"}</h2>
                <UserBadge userId={activeChat.id} />
              </div>
              {activeChat.username && <p className="text-xs text-primary/70">@{activeChat.username.replace(/^@/, "")}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCalling(true)} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
                <Phone className="w-5 h-5 text-primary" />
              </button>
              <button onClick={toggleBlock} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target" title={isBlocked ? "Разблокировать" : "Заблокировать"}>
                {isBlocked ? <ShieldCheck className="w-5 h-5 text-destructive" /> : <ShieldBan className="w-5 h-5 text-muted-foreground" />}
              </button>
            </div>
          </div>
        </GlassCard>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Начните разговор!</p>
            </div>
          ) : (
            visibleMessages.map((msg) => (
              <div key={msg.id} className={`flex group ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                <div className="flex items-start gap-1 max-w-[80%]">
                  <GlassCard className={`p-3 ${msg.sender_id === user?.id ? "bg-primary/20 border-primary/30" : ""}`}>
                    {msg.media_url && renderMedia(msg.media_url)}
                    {msg.content && msg.content !== "📎 Медиа" && msg.content !== "🎤 Голосовое сообщение" && msg.content !== "🎥 Видео-кружок" && (
                      <p className="text-sm break-words">{msg.content}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ru })}
                    </p>
                  </GlassCard>
                  <MessageContextMenu
                    messageId={msg.id}
                    messageType="dm"
                    isSender={msg.sender_id === user?.id}
                    onDeleted={() => setMessages((prev) => prev.filter((m) => m.id !== msg.id))}
                    onHidden={() => setHiddenIds((prev) => new Set([...prev, msg.id]))}
                  />
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
          <div className="flex items-end gap-2">
            <MediaUpload onUpload={handleMediaUpload} />
            <VoiceRecorder onRecorded={handleVoiceRecorded} />
            <VideoCircleRecorder onRecorded={handleVideoRecorded} />
            <FlameInput
              placeholder="Написать сообщение..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1"
            />
            <FlameButton onClick={sendMessage} size="md">
              <Send className="w-5 h-5" />
            </FlameButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Личные сообщения</h2>

      {conversations.length === 0 ? (
        <GlassCard className="text-center py-12">
          <MessageCircle className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">Нет сообщений</h3>
          <p className="text-muted-foreground">Найдите человека в поиске!</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <GlassCard
              key={conv.partnerId}
              className={`p-4 cursor-pointer hover:border-primary/50 transition-colors ${conv.unread ? "border-primary/50" : ""}`}
              onClick={() => openChatWithUser(conv.partnerId)}
            >
              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.stopPropagation(); onViewProfile?.(conv.partnerId); }} className="shrink-0">
                  <UserAvatar username={conv.partnerUsername} avatarUrl={conv.partnerAvatarUrl} size="lg" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold">{conv.partnerUsername || "Пользователь"}</h3>
                      <UserBadge userId={conv.partnerId} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true, locale: ru })}
                    </span>
                  </div>
                  {conv.partnerUsername && <p className="text-xs text-primary/70">@{conv.partnerUsername.replace(/^@/, "")}</p>}
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                </div>
                {conv.unread && <div className="w-3 h-3 rounded-full bg-primary" />}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
