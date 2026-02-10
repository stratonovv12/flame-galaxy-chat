import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { MessageReactions } from "@/components/ui/MessageReactions";
import { MediaUpload } from "@/components/ui/MediaUpload";
import { Users, Plus, Send, X, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface Group {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  creator_id: string;
  created_at: string;
}

interface GroupMessage {
  id: string;
  content: string;
  media_url: string | null;
  author_id: string;
  created_at: string;
  profiles?: { username: string | null; avatar_url: string | null } | null;
}

interface GroupsViewProps {
  onViewProfile?: (userId: string) => void;
}

export function GroupsView({ onViewProfile }: GroupsViewProps) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAvatar, setNewAvatar] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchMessages(selectedGroup.id);
      joinGroup(selectedGroup.id);

      const channel = supabase
        .channel(`group-msgs-${selectedGroup.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${selectedGroup.id}`,
        }, () => fetchMessages(selectedGroup.id))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedGroup]);

  const fetchGroups = async () => {
    const { data } = await supabase.from("groups").select("*").order("created_at", { ascending: false });
    setGroups(data || []);

    // Fetch member counts
    if (data && data.length > 0) {
      const counts: Record<string, number> = {};
      for (const g of data) {
        const { count } = await supabase.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", g.id);
        counts[g.id] = count || 0;
      }
      setMemberCounts(counts);
    }
  };

  const joinGroup = async (groupId: string) => {
    if (!user) return;
    await supabase.from("group_members").upsert({ group_id: groupId, user_id: user.id }, { onConflict: "group_id,user_id" });
  };

  const fetchMessages = async (groupId: string) => {
    const { data: msgs } = await supabase
      .from("group_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (!msgs) return;

    const authorIds = [...new Set(msgs.map((m) => m.author_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", authorIds);
    const profilesMap = new Map(profiles?.map((p) => [p.user_id, { username: p.username, avatar_url: p.avatar_url }]) || []);

    setMessages(msgs.map((m) => ({ ...m, profiles: profilesMap.get(m.author_id) || null })));
  };

  const createGroup = async () => {
    if (!newName.trim() || !user) return;
    setLoading(true);
    const { error } = await supabase.from("groups").insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      avatar_url: newAvatar.trim() || null,
      creator_id: user.id,
    });
    if (error) {
      toast({ title: "Ошибка", description: "Не удалось создать группу", variant: "destructive" });
    } else {
      toast({ title: "Группа создана!" });
      setNewName(""); setNewDesc(""); setNewAvatar(""); setShowCreate(false);
      fetchGroups();
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !mediaUrl) || !selectedGroup || !user) return;
    const { error } = await supabase.from("group_messages").insert({
      content: newMessage.trim() || (mediaUrl ? "📎 Медиа" : ""),
      media_url: mediaUrl || null,
      group_id: selectedGroup.id,
      author_id: user.id,
    });
    if (error) {
      toast({ title: "Ошибка", description: "Не удалось отправить", variant: "destructive" });
    } else {
      setNewMessage("");
      setMediaUrl("");
    }
  };

  if (selectedGroup) {
    return (
      <div className="flex flex-col h-full">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedGroup(null)} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
              <ArrowLeft className="w-5 h-5" />
            </button>
            {selectedGroup.avatar_url ? (
              <img src={selectedGroup.avatar_url} alt={selectedGroup.name} className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent" />
              </div>
            )}
            <div>
              <h2 className="font-semibold">{selectedGroup.name}</h2>
              <p className="text-xs text-muted-foreground">{memberCounts[selectedGroup.id] || 0} участников</p>
            </div>
          </div>
        </GlassCard>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Сообщений пока нет</p>
            </div>
          ) : (
            messages.map((msg) => (
              <GlassCard key={msg.id} className="p-3">
                <div className="flex items-start gap-3">
                  <button onClick={() => onViewProfile?.(msg.author_id)} className="shrink-0">
                    <UserAvatar username={msg.profiles?.username} avatarUrl={msg.profiles?.avatar_url} size="sm" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{msg.profiles?.username || "Пользователь"}</span>
                      <UserBadge userId={msg.author_id} />
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ru })}
                      </span>
                    </div>
                    {msg.media_url && (
                      msg.media_url.match(/\.(mp4|webm|mov)/) ? (
                        <video src={msg.media_url} controls className="mt-2 max-h-64 rounded-lg" />
                      ) : (
                        <img src={msg.media_url} alt="" className="mt-2 max-h-64 rounded-lg object-cover cursor-pointer" onClick={() => window.open(msg.media_url!, "_blank")} />
                      )
                    )}
                    {msg.content && msg.content !== "📎 Медиа" && <p className="mt-1 text-sm break-words">{msg.content}</p>}
                    <MessageReactions postId={msg.id} className="mt-2" />
                  </div>
                </div>
              </GlassCard>
            ))
          )}
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Группы</h2>
        <FlameButton onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Создать
        </FlameButton>
      </div>

      {groups.length === 0 ? (
        <GlassCard className="text-center py-12">
          <Users className="w-16 h-16 mx-auto mb-4 text-accent/50" />
          <h3 className="text-lg font-semibold mb-2">Групп пока нет</h3>
          <p className="text-muted-foreground mb-4">Создайте первую группу!</p>
          <FlameButton onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Создать группу
          </FlameButton>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
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
                  <p className="text-xs text-muted-foreground">{memberCounts[g.id] || 0} участников</p>
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
              <FlameInput label="Название" placeholder="Название группы" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <FlameInput label="Описание" placeholder="О чём группа?" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
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
