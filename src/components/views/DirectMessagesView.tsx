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
import { useLanguage } from "@/contexts/LanguageContext";
import { MessageContextMenu } from "@/components/ui/MessageContextMenu";
import { ChatListContextMenu } from "@/components/ui/ChatListContextMenu";
import { UploadingBubble } from "@/components/ui/UploadingBubble";
import { CallUI } from "@/components/ui/CallUI";
import { IncomingCallUI } from "@/components/ui/IncomingCallUI";
import { OnlineIndicator } from "@/components/ui/OnlineIndicator";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { MessageCircle, Send, ArrowLeft, Phone, ShieldBan, ShieldCheck, X, Forward, Ghost, ChevronDown, Pin, PinOff, Flame } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { playNotificationSound, showBrowserNotification, requestNotificationPermission, setActiveChatPartner } from "@/lib/notifications";
import { sendPush } from "@/lib/push";

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
  read_at?: string | null;
}

interface PinnedMessage {
  id: string;
  message_id: string;
  message: Message | null;
}

interface DirectMessagesViewProps {
  selectedUserId?: string | null;
  onClearSelectedUser?: () => void;
  onViewProfile?: (userId: string) => void;
}

export function DirectMessagesView({ selectedUserId, onClearSelectedUser, onViewProfile }: DirectMessagesViewProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
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
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const { pendingUploads, startUpload, cancelUpload } = useMediaUpload();

  // Call state
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ id: string; callerId: string; callerUsername: string | null; callerAvatarUrl: string | null } | null>(null);

  const partnerPresence = useOnlineStatus(activeChat?.id);

  // Pinned messages (max 2 per chat)
  const [pinned, setPinned] = useState<PinnedMessage[]>([]);

  // Scroll behavior
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadIncoming, setUnreadIncoming] = useState(0);

  // Ghost mode (per-chat ephemeral)
  const [ghostMode, setGhostMode] = useState(false);
  const [ghostHiddenIds, setGhostHiddenIds] = useState<Set<string>>(new Set());
  const ghostTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Tell the notifications system which chat is open (suppresses sound for that partner)
  useEffect(() => {
    setActiveChatPartner(activeChat?.id || null);
    return () => setActiveChatPartner(null);
  }, [activeChat]);

  // Reset ghost state when switching chats
  useEffect(() => {
    setGhostMode(false);
    setGhostHiddenIds(new Set());
    ghostTimers.current.forEach(t => clearTimeout(t));
    ghostTimers.current.clear();
  }, [activeChat?.id]);

  // Schedule fade for new messages while ghost mode is on
  useEffect(() => {
    if (!ghostMode) return;
    messages.forEach(m => {
      if (ghostHiddenIds.has(m.id) || ghostTimers.current.has(m.id)) return;
      const timer = setTimeout(() => {
        setGhostHiddenIds(prev => new Set([...prev, m.id]));
        ghostTimers.current.delete(m.id);
      }, 10000);
      ghostTimers.current.set(m.id, timer);
    });
  }, [messages, ghostMode, ghostHiddenIds]);

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
        if (payload.eventType === "UPDATE") {
          const upd = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === upd.id ? { ...m, ...upd } : m));
          return;
        }
        const newMsg = payload.new as Message;
        if (newMsg.sender_id === user.id || newMsg.receiver_id === user.id) {
          if (activeChat && (newMsg.sender_id === activeChat.id || newMsg.receiver_id === activeChat.id)) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            // Mark as read only if it's incoming AND user is viewing bottom of chat
            if (newMsg.sender_id !== user.id && isAtBottom) {
              supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("id", newMsg.id).then();
            } else if (newMsg.sender_id !== user.id) {
              setUnreadIncoming(c => c + 1);
            }
          }
          if (newMsg.sender_id !== user.id) {
            playNotificationSound({ messageId: newMsg.id, senderId: newMsg.sender_id });
            showBrowserNotification(t("newMessage" as any) || "New message", newMsg.content, { messageId: newMsg.id, senderId: newMsg.sender_id });
          }
          fetchConversations();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeChat, isAtBottom]);

  // Smart auto-scroll: only when already at bottom
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      if (unreadIncoming > 0) setUnreadIncoming(0);
    }
  }, [messages, isAtBottom]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < 80;
    setIsAtBottom(atBottom);
    if (atBottom && unreadIncoming > 0) {
      setUnreadIncoming(0);
      // Mark recent unread as read
      if (user && activeChat) {
        supabase.from("direct_messages").update({ read_at: new Date().toISOString() })
          .eq("receiver_id", user.id).eq("sender_id", activeChat.id).is("read_at", null).then();
      }
    }
  };

  const scrollToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
    setUnreadIncoming(0);
  };

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
      toast({ title: t("error"), description: t("callFailed"), variant: "destructive" });
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
          content: `📞 ${t("missedCall")}`,
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
      toast({ title: t("userUnblocked") });
    } else {
      await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: activeChat.id });
      toast({ title: t("userBlockedAction") });
    }
    setIsBlocked(!isBlocked);
  };

  const fetchConversations = async () => {
    if (!user) return;
    const [{ data: messagesData }, { data: deletedData }] = await Promise.all([
      supabase.from("direct_messages").select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
      supabase.from("deleted_conversations" as any).select("partner_id, deleted_at").eq("user_id", user.id),
    ]);

    const deletedMap = new Map<string, string>(
      (deletedData as any[] || []).map((d: any) => [d.partner_id, d.deleted_at])
    );

    const conversationsMap = new Map<string, { lastMessage: any; unreadCount: number }>();
    for (const msg of messagesData || []) {
      const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      // Skip messages older than user's chat deletion timestamp
      const delAt = deletedMap.get(partnerId);
      if (delAt && new Date(msg.created_at) <= new Date(delAt)) continue;
      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, { lastMessage: msg, unreadCount: 0 });
      }
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
    fetchPinned(partnerId);
    // Reopening a previously deleted chat clears the deletion marker
    if (user) {
      await supabase.from("deleted_conversations" as any).delete()
        .eq("user_id", user.id).eq("partner_id", partnerId);
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
    setIsAtBottom(true);
    setUnreadIncoming(0);
  };

  const fetchPinned = async (partnerId: string) => {
    if (!user) return;
    const { data } = await supabase.from("pinned_messages" as any)
      .select("id, message_id")
      .eq("user_id", user.id).eq("partner_id", partnerId)
      .order("created_at", { ascending: true }) as any;
    const rows = (data || []) as any[];
    if (rows.length === 0) { setPinned([]); return; }
    const msgIds = rows.map(r => r.message_id);
    const { data: msgs } = await supabase.from("direct_messages").select("*").in("id", msgIds);
    const map = new Map((msgs || []).map(m => [m.id, m]));
    setPinned(rows.map(r => ({ id: r.id, message_id: r.message_id, message: map.get(r.message_id) || null })));
  };

  const pinMessage = async (msg: Message) => {
    if (!user || !activeChat) return;
    if (pinned.length >= 2) {
      toast({ title: t("pinLimitReached" as any) || "Maximum 2 pinned messages", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("pinned_messages" as any)
      .insert({ user_id: user.id, partner_id: activeChat.id, message_id: msg.id });
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("messagePinned" as any) || "Message pinned" });
      fetchPinned(activeChat.id);
    }
  };

  const unpinMessage = async (pinnedRowId: string) => {
    if (!user || !activeChat) return;
    await supabase.from("pinned_messages" as any).delete().eq("id", pinnedRowId);
    fetchPinned(activeChat.id);
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !mediaUrl) || !activeChat || !user) return;
    if (blockedByThem) {
      toast({ title: t("error"), description: t("blocked"), variant: "destructive" });
      return;
    }
    const content = newMessage.trim() || (mediaUrl ? t("media") : "");
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: activeChat.id,
      content,
      media_url: mediaUrl || null,
      reply_to_id: replyTo?.id || null,
    });
    if (error) {
      toast({ title: t("error"), description: t("sendFailed"), variant: "destructive" });
    } else {
      setNewMessage(""); setMediaUrl(""); setReplyTo(null);
      // Fire push to receiver (best-effort)
      sendPush(activeChat.id, t("newMessage" as any) || "New message", content, "/");
      // Sender just sent -> jump to bottom
      setIsAtBottom(true);
    }
  };

  const handleVoiceRecorded = (blob: Blob, _durationSec: number) => {
    if (!activeChat || !user) return;
    startUpload(blob, "voice", async (url) => {
      await supabase.from("direct_messages").insert({
        sender_id: user.id, receiver_id: activeChat.id,
        content: `🎤 ${t("voiceMessage")}`, media_url: url,
      });
      sendPush(activeChat.id, t("newMessage" as any) || "New message", `🎤 ${t("voiceMessage")}`, "/");
    });
  };

  const forwardMessage = async (targetUserId: string) => {
    if (!forwardMsg || !user) return;
    await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: targetUserId,
      content: forwardMsg.content,
      media_url: forwardMsg.media_url,
      forwarded_from: forwardMsg.sender_id === user.id ? t("user") : (activeChat?.username || t("user")),
    });
    toast({ title: t("forwarded") });
    setForwardMsg(null);
  };

  const scrollToMessage = (id: string) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMsgId(id);
    setTimeout(() => setHighlightedMsgId(prev => (prev === id ? null : prev)), 1800);
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
            <h2 className="font-semibold">{t("forwardMessageTitle")}</h2>
          </div>
        </GlassCard>
        <div className="p-4 mb-2">
          <GlassCard className="p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">{t("messageLabel")}</p>
            <p className="text-sm">{forwardMsg.content}</p>
          </GlassCard>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-sm text-muted-foreground mb-2">{t("pickChat")}</p>
          {conversations.map(conv => (
            <GlassCard key={conv.partnerId} className="p-3 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => forwardMessage(conv.partnerId)}>
              <div className="flex items-center gap-3">
                <UserAvatar username={conv.partnerUsername} avatarUrl={conv.partnerAvatarUrl} size="sm" />
                <span className="font-medium text-sm">{conv.partnerUsername || t("user")}</span>
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
    const ghostShell = ghostMode
      ? "bg-zinc-900 text-zinc-200 [&_*]:!text-zinc-200 grayscale-[0.85]"
      : "";

    return (
      <div className={`relative flex flex-col h-full transition-colors duration-300 ${ghostShell}`}>
        <GlassCard className={`rounded-none border-x-0 border-t-0 p-3 shrink-0 ${ghostMode ? "bg-zinc-950/95 border-zinc-700/60 shadow-[0_0_18px_rgba(180,180,200,0.18)]" : "bg-background/85"}`}>
          <div className="flex items-center gap-2">
            <button onClick={closeChat} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={() => onViewProfile?.(activeChat.id)} className="shrink-0">
              <UserAvatar username={activeChat.username} avatarUrl={activeChat.avatarUrl} size="sm" showOnline isOnline={partnerPresence.is_online} />
            </button>
            <button onClick={() => onViewProfile?.(activeChat.id)} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold text-sm truncate">{activeChat.username || t("user")}</h2>
                <UserBadge userId={activeChat.id} />
              </div>
              {ghostMode ? (
                <p className="text-[10px] text-zinc-400 flex items-center gap-1"><Ghost className="w-3 h-3" /> {t("ghostActive")}</p>
              ) : (
                <OnlineIndicator userId={activeChat.id} showText />
              )}
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={startCall} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target" title={t("call" as any)}>
                <Phone className={`w-5 h-5 ${ghostMode ? "text-zinc-300" : "text-primary"}`} />
              </button>
              <button onClick={toggleBlock} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
                {isBlocked ? <ShieldCheck className="w-5 h-5 text-destructive" /> : <ShieldBan className="w-5 h-5 text-muted-foreground" />}
              </button>
              <button
                onClick={() => setGhostMode(g => !g)}
                title={t("ghostMode")}
                className={`p-2 rounded-lg transition-all touch-target ${ghostMode
                  ? "bg-zinc-700/60 text-zinc-100 shadow-[0_0_14px_rgba(200,200,210,0.45)]"
                  : "hover:bg-muted/50 text-muted-foreground"}`}>
                <Ghost className="w-5 h-5" />
              </button>
            </div>
          </div>
          {ghostMode && <p className="text-[10px] text-zinc-500 mt-1.5 text-center">{t("ghostHint")}</p>}
        </GlassCard>

        {/* Pinned messages bar (max 2) */}
        {pinned.length > 0 && (
          <div className={`px-3 py-2 border-b shrink-0 space-y-1 ${ghostMode ? "bg-zinc-900/80 border-zinc-700/60" : "bg-muted/30 border-border"}`}>
            {pinned.map(p => p.message && (
              <div key={p.id} className="flex items-center gap-2">
                <Pin className={`w-3.5 h-3.5 shrink-0 ${ghostMode ? "text-zinc-300" : "text-primary"}`} />
                <button onClick={() => scrollToMessage(p.message_id)} className="flex-1 text-left text-xs truncate hover:underline">
                  {p.message.content || (p.message.media_url ? t("media") : "")}
                </button>
                <button onClick={() => unpinMessage(p.id)} className="p-1 hover:bg-muted/50 rounded">
                  <PinOff className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div ref={messagesContainerRef} onScroll={handleScroll} className={`flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative ${ghostMode ? "bg-zinc-900" : ""}`}>
          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t("startConversation")}</p>
            </div>
          ) : (
            visibleMessages.map(msg => {
              const isGhostFading = ghostMode && ghostHiddenIds.has(msg.id);
              const isMine = msg.sender_id === user?.id;
              const isHighlighted = highlightedMsgId === msg.id;
              const bubbleBase = ghostMode
                ? (isMine ? "bg-zinc-700/70 border-zinc-600/60" : "bg-zinc-800/80 border-zinc-700/60")
                : (isMine ? "bg-primary/20 border-primary/30" : "");
              return (
              <div key={msg.id}
                ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
                className={`flex group ${isMine ? "justify-end" : "justify-start"} transition-all duration-700 ${isGhostFading ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100"} ${isHighlighted ? "scale-[1.02]" : ""}`}>
                <div className="flex items-start gap-1 max-w-[80%]">
                  <GlassCard className={`p-3 transition-shadow duration-500 ${bubbleBase} ${isHighlighted ? (ghostMode ? "shadow-[0_0_22px_rgba(200,200,210,0.55)] ring-1 ring-zinc-300/40" : "shadow-[0_0_22px_rgba(127,90,240,0.6)] ring-1 ring-primary/50") : ""}`}>
                    {msg.forwarded_from && (
                      <p className={`text-xs mb-1 flex items-center gap-1 ${ghostMode ? "text-zinc-400" : "text-primary/70"}`}>
                        <Forward className="w-3 h-3" /> {t("forwardedFromShort")} {msg.forwarded_from}
                      </p>
                    )}
                    {msg.reply_to_id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to_id!); }}
                        className={`block w-full text-left mb-2 pl-2 border-l-2 text-xs hover:bg-muted/20 rounded-r transition-colors ${ghostMode ? "border-zinc-400/60 text-zinc-400" : "border-primary/50 text-muted-foreground"}`}>
                        {getReplyPreview(msg.reply_to_id) || t("message")}
                      </button>
                    )}
                    {msg.media_url && renderMedia(msg.media_url)}
                    {msg.content && msg.content !== t("media") && !msg.content.startsWith("🎤") && !msg.content.startsWith("🎥") && (
                      <p className="text-sm break-words">{msg.content}</p>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <p className={`text-xs ${ghostMode ? "text-zinc-500" : "text-muted-foreground"}`}>
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: lang === "ru" ? ru : enUS })}
                      </p>
                      {isMine && (
                        <Flame
                          className={`w-3 h-3 ${msg.read_at ? "text-primary fill-primary/30" : "text-muted-foreground/70 fill-muted-foreground/10"}`}
                          aria-label={msg.read_at ? "read" : "delivered"}
                        />
                      )}
                    </div>
                  </GlassCard>
                  <MessageContextMenu
                    messageId={msg.id} messageType="dm" isSender={isMine}
                    messageContent={msg.content}
                    isPinned={pinned.some(p => p.message_id === msg.id)}
                    onDeleted={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                    onHidden={() => setHiddenIds(prev => new Set([...prev, msg.id]))}
                    onReply={() => setReplyTo(msg)}
                    onForward={() => setForwardMsg(msg)}
                    onPin={() => pinMessage(msg)}
                    onUnpin={() => {
                      const p = pinned.find(pp => pp.message_id === msg.id);
                      if (p) unpinMessage(p.id);
                    }}
                  />
                </div>
              </div>
              );
            })
          )}
          {pendingUploads.map(upload => (
            <UploadingBubble key={upload.id} upload={upload} onCancel={cancelUpload} />
          ))}
          {partnerTyping && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex gap-1.5">
                <div className={`w-2 h-2 rounded-full typing-dot ${ghostMode ? "bg-zinc-400" : "bg-primary"}`} />
                <div className={`w-2 h-2 rounded-full typing-dot ${ghostMode ? "bg-zinc-400" : "bg-primary"}`} />
                <div className={`w-2 h-2 rounded-full typing-dot ${ghostMode ? "bg-zinc-400" : "bg-primary"}`} />
              </div>
              <span className={`text-xs ${ghostMode ? "text-zinc-400" : "text-muted-foreground"}`}>{t("typingShort")}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {!isAtBottom && (
          <button
            onClick={scrollToLatest}
            className={`absolute right-4 z-30 flex items-center gap-1.5 rounded-full pl-3 pr-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md border transition-all hover:scale-105 active:scale-95 ${ghostMode ? "bg-zinc-800/90 border-zinc-700 text-zinc-100" : "bg-primary/95 border-primary/50 text-primary-foreground shadow-primary/30"}`}
            style={{ bottom: replyTo ? "140px" : "92px" }}
            aria-label="Scroll to latest"
          >
            {unreadIncoming > 0 && (
              <span className="font-bold">{unreadIncoming > 99 ? "99+" : unreadIncoming}</span>
            )}
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        {replyTo && (
          <div className={`px-4 py-2 border-t flex items-center gap-2 ${ghostMode ? "border-zinc-700 bg-zinc-800/60" : "border-border bg-muted/30"}`}>
            <div className={`flex-1 pl-2 border-l-2 ${ghostMode ? "border-zinc-400" : "border-primary"}`}>
              <p className={`text-xs font-medium ${ghostMode ? "text-zinc-300" : "text-primary"}`}>{t("replyTo")}</p>
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
            <FlameInput
              placeholder={t("writeMessage")}
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
      <h2 className="text-xl font-bold">{t("directMessages")}</h2>
      {conversations.length === 0 ? (
        <GlassCard className="text-center py-12">
          <MessageCircle className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">{t("noMessages")}</h3>
          <p className="text-muted-foreground">{t("findPeople")}</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {conversations.map(conv => (
            <ChatListContextMenu key={conv.partnerId} partnerId={conv.partnerId} partnerUsername={conv.partnerUsername}
              onDeleted={() => { setConversations(prev => prev.filter(c => c.partnerId !== conv.partnerId)); fetchConversations(); }}>
              <GlassCard
                className={`p-4 cursor-pointer hover:border-primary/50 transition-colors ${conv.unreadCount > 0 ? "border-primary/50" : ""}`}
                onClick={() => openChatWithUser(conv.partnerId)}>
                <div className="flex items-center gap-3">
                  <button onClick={e => { e.stopPropagation(); onViewProfile?.(conv.partnerId); }} className="shrink-0">
                    <UserAvatar username={conv.partnerUsername} avatarUrl={conv.partnerAvatarUrl} size="lg" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold">{conv.partnerUsername || t("user")}</h3>
                        <UserBadge userId={conv.partnerId} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true, locale: lang === "ru" ? ru : enUS })}
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
            </ChatListContextMenu>
          ))}
        
        </div>
      )}
    </div>
  );
}
