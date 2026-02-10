import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { MediaUpload } from "@/components/ui/MediaUpload";
import { MessageCircle, Send, ArrowLeft } from "lucide-react";
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
  const [newMessage, setNewMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user) fetchConversations(); }, [user]);
  useEffect(() => { if (selectedUserId && user) openChatWithUser(selectedUserId); }, [selectedUserId, user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dm-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
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
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: activeChat.id,
      content: newMessage.trim() || (mediaUrl ? "📎 Медиа" : ""),
      media_url: mediaUrl || null,
    });
    if (error) {
      toast({ title: "Ошибка", description: "Не удалось отправить", variant: "destructive" });
    } else {
      setNewMessage(""); setMediaUrl("");
    }
  };

  const closeChat = () => {
    setActiveChat(null); setMessages([]); onClearSelectedUser?.();
  };

  if (activeChat) {
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
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold">{activeChat.username || "Пользователь"}</h2>
                <UserBadge userId={activeChat.id} />
              </div>
              {activeChat.username && <p className="text-xs text-primary/70">@{activeChat.username.replace(/^@/, "")}</p>}
            </div>
          </div>
        </GlassCard>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Начните разговор!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                <GlassCard className={`max-w-[80%] p-3 ${msg.sender_id === user?.id ? "bg-primary/20 border-primary/30" : ""}`}>
                  {msg.media_url && (
                    msg.media_url.match(/\.(mp4|webm|mov)/) ? (
                      <video src={msg.media_url} controls className="max-h-48 rounded-lg mb-2" />
                    ) : (
                      <img src={msg.media_url} alt="" className="max-h-48 rounded-lg object-cover mb-2 cursor-pointer" onClick={() => window.open(msg.media_url!, "_blank")} />
                    )
                  )}
                  {msg.content && msg.content !== "📎 Медиа" && <p className="text-sm break-words">{msg.content}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ru })}
                  </p>
                </GlassCard>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
          <div className="flex items-end gap-2">
            <MediaUpload onUpload={setMediaUrl} />
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
