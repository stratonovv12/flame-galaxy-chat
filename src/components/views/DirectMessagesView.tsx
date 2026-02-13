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
import { UploadingBubble } from "@/components/ui/UploadingBubble";
import { CallUI } from "@/components/ui/CallUI";
import { IncomingCallUI } from "@/components/ui/IncomingCallUI";
import { OnlineIndicator } from "@/components/ui/OnlineIndicator";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { MessageCircle, Send, ArrowLeft, Phone, ShieldBan, ShieldCheck, X, Forward } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { playNotificationSound, showBrowserNotification, requestNotificationPermission } from "@/lib/notifications";

interface Conversation {
  partnerId: string;
  partnerUsername: string | null;
  partnerAvatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  media_url: string | null;
  created_at: string;
  reply_to_id: string | null;
  forwarded_from: string | null;
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
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByThem, setBlockedByThem] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardTargets, setForwardTargets] = useState<Conversation[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { pendingUploads, startUpload, cancelUpload } = useMediaUpload();

  // Call state
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ id: string; callerId: string; callerUsername: string | null; callerAvatarUrl: string | null } | null>(null);

  const partnerPresence = useOnlineStatus(activeChat?.id);

  useEffect(() => {
    if (user) { fetchConversations(); requestNotificationPermission(); }
  }, [user]);
  useEffect(() => { if (selectedUserId && user) openChatWithUser(selectedUserId); }, [selectedUserId, user]);

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("calls-incoming")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `receiver_id=eq.${user.id}` }, async (payload) => {
        const call = payload.new as any;
        if (call.status !== "ringing") return;
        const { data: profile } = await supabase.from("profiles").select("username, avatar_url").eq("user_id", call.caller_id).maybeSingle();
        setIncomingCall({
          id: call.id,
          callerId: call.caller_id,
          callerUsername: profile?.username || null,
          callerAvatarUrl: profile?.avatar_url || null,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls" }, (payload) => {
        const call = payload.new as any;
        if (call.status === "ended" || call.status === "missed" || call.status === "rejected") {
          if (incomingCall?.id === call.id) setIncomingCall(null);
          if (activeCallId === call.id) {
            setActiveCallId(null);
            setCallActive(false);
          }
        }
        if (call.status === "active" && activeCallId === call.id) {
          setCallActive(true);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, incomingCall, activeCallId]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
          fetchConversations();
          return;
        }
        const newMsg = payload.new as Message;
        if (newMsg.sender_id === user.id || newMsg.receiver_id === user.id) {
          if (activeChat && (newMsg.sender_id === activeChat.id || newMsg.receiver_id === activeChat.id)) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            // Mark as read if it's incoming and chat is open
            if (newMsg.sender_id !== user.id) {
              supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("id", newMsg.id).then();
            }
          }
          if (newMsg.sender_id !== user.id) {
            playNotificationSound();
            showBrowserNotification("Новое сообщение", newMsg.content);
          }
          fetchConversations();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeChat]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Typing indicator via broadcast
  useEffect(() => {
    if (!activeChat || !user) { setPartnerTyping(false); return; }
    const chatId = [user.id, activeChat.id].sort().join("_");
    const channel = supabase.channel(`typing-${chatId}`);
    channel.on("broadcast", { event: "typing" }, (payload) => {
      if (payload.payload?.userId === activeChat.id) {
        setPartnerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 3000);
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); setPartnerTyping(false); };
  }, [activeChat, user]);

  const broadcastTyping = () => {
    if (!activeChat || !user) return;
    const chatId = [user.id, activeChat.id].sort().join("_");
    supabase.channel(`typing-${chatId}`).send({ type: "broadcast", event: "typing", payload: { userId: user.id } });
  };

  useEffect(() => {
    if (activeChat && user) { checkBlockStatus(activeChat.id); fetchHiddenMessages(); }
  }, [activeChat, user]);

  const startCall = async () => {
    if (!user || !activeChat) return;
    const { data, error } = await supabase.from("calls").insert({
      caller_id: user.id,
      receiver_id: activeChat.id,
      status: "ringing",
    }).select().single();
    if (error) {
      toast({ title: "Ошибка", description: "Не удалось начать вызов", variant: "destructive" });
      return;
    }
    setActiveCallId(data.id);
    // Auto-miss after 30s
    setTimeout(async () => {
      const { data: callData } = await supabase.from("calls").select("status").eq("id", data.id).maybeSingle();
      if (callData?.status === "ringing") {
        await supabase.from("calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", data.id);
        setActiveCallId(null);
        // Insert missed call message
        await supabase.from("direct_messages").insert({
          sender_id: user.id, receiver_id: activeChat.id,
          content: "📞 Пропущенный вызов",
        });
      }
    }, 30000);
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    await supabase.from("calls").update({
      status: "active", started_at: new Date().toISOString()
    }).eq("id", incomingCall.id);
    setActiveCallId(incomingCall.id);
    setCallActive(true);
    // Set activeChat to caller
    setActiveChat({
      id: incomingCall.callerId,
      username: incomingCall.callerUsername,
      avatarUrl: incomingCall.callerAvatarUrl,
    });
    setIncomingCall(null);
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    await supabase.from("calls").update({
      status: "rejected", ended_at: new Date().toISOString()
    }).eq("id", incomingCall.id);
    setIncomingCall(null);
  };

  const endCall = async () => {
    if (activeCallId) {
      await supabase.from("calls").update({
        status: "ended", ended_at: new Date().toISOString()
      }).eq("id", activeCallId);
    }
    setActiveCallId(null);
    setCallActive(false);
  };

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
    setHiddenIds(new Set(data?.map(h => h.message_id) || []));
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
      .from("direct_messages").select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    const conversationsMap = new Map<string, { lastMessage: any; unreadCount: number }>();
    for (const msg of messagesData || []) {
      const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, { lastMessage: msg, unreadCount: 0 });
      }
      // Count unread from this partner
      if (msg.receiver_id === user.id && !msg.read_at) {
        const entry = conversationsMap.get(partnerId)!;
        entry.unreadCount++;
      }
    }

    const partnerIds = Array.from(conversationsMap.keys());
    if (partnerIds.length === 0) { setConversations([]); return; }

    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", partnerIds);
    const profilesMap = new Map(profiles?.map(p => [p.user_id, { username: p.username, avatar_url: p.avatar_url }]) || []);

    setConversations(Array.from(conversationsMap.entries()).map(([partnerId, data]) => {
      const profile = profilesMap.get(partnerId);
      return {
        partnerId,
        partnerUsername: profile?.username || null,
        partnerAvatarUrl: profile?.avatar_url || null,
        lastMessage: data.lastMessage.content,
        lastMessageAt: data.lastMessage.created_at,
        unreadCount: data.unreadCount,
      };
    }));
  };

  const openChatWithUser = async (partnerId: string) => {
    const { data: profile } = await supabase.from("profiles").select("user_id, username, avatar_url").eq("user_id", partnerId).maybeSingle();
    setActiveChat({ id: partnerId, username: profile?.username || null, avatarUrl: profile?.avatar_url || null });
    fetchMessages(partnerId);
    // Mark all as read
    if (user) {
      await supabase.from("direct_messages").update({ read_at: new Date().toISOString() })
        .eq("receiver_id", user.id).eq("sender_id", partnerId).is("read_at", null);
      fetchConversations();
    }
  };

  const fetchMessages = async (partnerId: string) => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("direct_messages").select("*")
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
      reply_to_id: replyTo?.id || null,
    });
    if (error) {
      toast({ title: "Ошибка", description: "Не удалось отправить", variant: "destructive" });
    } else {
      setNewMessage(""); setMediaUrl(""); setReplyTo(null);
    }
  };

  const handleVoiceRecorded = (blob: Blob, _durationSec: number) => {
    if (!activeChat || !user) return;
    startUpload(blob, "voice", async (url) => {
      await supabase.from("direct_messages").insert({
        sender_id: user.id, receiver_id: activeChat.id,
        content: "🎤 Голосовое сообщение", media_url: url,
      });
    });
  };

  const handleVideoRecorded = (blob: Blob, _durationSec: number, _thumbnail: string) => {
    if (!activeChat || !user) return;
    startUpload(blob, "circle", async (url) => {
      await supabase.from("direct_messages").insert({
        sender_id: user.id, receiver_id: activeChat.id,
        content: "🎥 Видео-кружок", media_url: url,
      });
    });
  };

  const forwardMessage = async (targetUserId: string) => {
    if (!forwardMsg || !user) return;
    await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: targetUserId,
      content: forwardMsg.content,
      media_url: forwardMsg.media_url,
      forwarded_from: forwardMsg.sender_id === user.id ? "Вы" : (activeChat?.username || "Пользователь"),
    });
    toast({ title: "Сообщение переслано" });
    setForwardMsg(null);
  };

  const closeChat = () => {
    setActiveChat(null); setMessages([]); setHiddenIds(new Set()); setReplyTo(null); onClearSelectedUser?.();
  };

  const getReplyPreview = (replyId: string) => {
    const msg = messages.find(m => m.id === replyId);
    return msg ? msg.content.slice(0, 60) : null;
  };

  const renderMedia = (url: string) => {
    if (url.includes("_circle")) {
      return <video src={url} controls playsInline className="w-48 h-48 rounded-full object-cover mb-2 border-2 border-primary" style={{ aspectRatio: "1/1" }} />;
    }
    if (url.includes("_voice")) {
      return <audio src={url} controls className="mb-2 max-w-full" />;
    }
    if (url.match(/\.(mp4|mov|webm)/i) || url.includes("video")) {
      return <video src={url} controls playsInline className="max-h-48 rounded-lg mb-2" />;
    }
    return <img src={url} alt="" className="max-h-48 rounded-lg object-cover mb-2 cursor-pointer" onClick={() => window.open(url, "_blank")} />;
  };

  // Incoming call overlay
  if (incomingCall) {
    return <IncomingCallUI
      callerUsername={incomingCall.callerUsername}
      callerAvatarUrl={incomingCall.callerAvatarUrl}
      onAccept={acceptCall}
      onReject={rejectCall}
    />;
  }

  // Active call (outgoing ringing or connected)
  if (activeCallId && activeChat) {
    return <CallUI
      partnerUsername={activeChat.username}
      partnerAvatarUrl={activeChat.avatarUrl}
      onEnd={endCall}
      isActive={callActive}
    />;
  }

  // Forward dialog
  if (forwardMsg) {
    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setForwardMsg(null)} className="p-2 hover:bg-muted/50 rounded-lg touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-semibold">Переслать сообщение</h2>
          </div>
        </GlassCard>
        <div className="p-4 mb-2">
          <GlassCard className="p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Сообщение:</p>
            <p className="text-sm">{forwardMsg.content}</p>
          </GlassCard>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-sm text-muted-foreground mb-2">Выберите чат:</p>
          {conversations.map(conv => (
            <GlassCard key={conv.partnerId} className="p-3 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => forwardMessage(conv.partnerId)}>
              <div className="flex items-center gap-3">
                <UserAvatar username={conv.partnerUsername} avatarUrl={conv.partnerAvatarUrl} size="sm" />
                <span className="font-medium text-sm">{conv.partnerUsername || "Пользователь"}</span>
                <Forward className="w-4 h-4 ml-auto text-primary" />
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    );
  }

  if (activeChat) {
    const visibleMessages = messages.filter(m => !hiddenIds.has(m.id));

    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button onClick={closeChat} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={() => onViewProfile?.(activeChat.id)} className="shrink-0">
              <UserAvatar username={activeChat.username} avatarUrl={activeChat.avatarUrl} size="md" showOnline isOnline={partnerPresence.is_online} />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold">{activeChat.username || "Пользователь"}</h2>
                <UserBadge userId={activeChat.id} />
              </div>
              <OnlineIndicator userId={activeChat.id} showText />
            </div>
            <div className="flex items-center gap-1">
              <button onClick={startCall} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
                <Phone className="w-5 h-5 text-primary" />
              </button>
              <button onClick={toggleBlock} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
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
            visibleMessages.map(msg => (
              <div key={msg.id} className={`flex group ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                <div className="flex items-start gap-1 max-w-[80%]">
                  <GlassCard className={`p-3 ${msg.sender_id === user?.id ? "bg-primary/20 border-primary/30" : ""}`}>
                    {msg.forwarded_from && (
                      <p className="text-xs text-primary/70 mb-1 flex items-center gap-1">
                        <Forward className="w-3 h-3" /> Переслано от {msg.forwarded_from}
                      </p>
                    )}
                    {msg.reply_to_id && (
                      <div className="mb-2 pl-2 border-l-2 border-primary/50 text-xs text-muted-foreground">
                        {getReplyPreview(msg.reply_to_id) || "Сообщение"}
                      </div>
                    )}
                    {msg.media_url && renderMedia(msg.media_url)}
                    {msg.content && msg.content !== "📎 Медиа" && msg.content !== "🎤 Голосовое сообщение" && msg.content !== "🎥 Видео-кружок" && (
                      <p className="text-sm break-words">{msg.content}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ru })}
                    </p>
                  </GlassCard>
                  <MessageContextMenu
                    messageId={msg.id} messageType="dm" isSender={msg.sender_id === user?.id}
                    messageContent={msg.content}
                    onDeleted={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                    onHidden={() => setHiddenIds(prev => new Set([...prev, msg.id]))}
                    onReply={() => setReplyTo(msg)}
                    onForward={() => setForwardMsg(msg)}
                  />
                </div>
              </div>
            ))
          )}
          {pendingUploads.map(upload => (
            <UploadingBubble key={upload.id} upload={upload} onCancel={cancelUpload} />
          ))}
          {partnerTyping && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
                <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
              </div>
              <span className="text-xs text-muted-foreground">печатает...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {replyTo && (
          <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2">
            <div className="flex-1 pl-2 border-l-2 border-primary">
              <p className="text-xs text-primary font-medium">Ответ</p>
              <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-muted/50 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
          <div className="flex items-end gap-2">
            <MediaUpload onUpload={setMediaUrl} />
            <VoiceRecorder onRecorded={handleVoiceRecorded} />
            <VideoCircleRecorder onRecorded={handleVideoRecorded} />
            <FlameInput
              placeholder="Написать сообщение..."
              value={newMessage}
              onChange={e => { setNewMessage(e.target.value); broadcastTyping(); }}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              className="flex-1"
            />
            <FlameButton onClick={sendMessage} size="md"><Send className="w-5 h-5" /></FlameButton>
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
          {conversations.map(conv => (
            <GlassCard key={conv.partnerId}
              className={`p-4 cursor-pointer hover:border-primary/50 transition-colors ${conv.unreadCount > 0 ? "border-primary/50" : ""}`}
              onClick={() => openChatWithUser(conv.partnerId)}>
              <div className="flex items-center gap-3">
                <button onClick={e => { e.stopPropagation(); onViewProfile?.(conv.partnerId); }} className="shrink-0">
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
                {conv.unreadCount > 0 && (
                  <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1.5">
                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                  </span>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
