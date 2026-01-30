import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Hash, Plus, Send, Users, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  created_at: string;
}

interface Post {
  id: string;
  content: string;
  author_id: string;
  created_at: string;
  profiles?: { username: string | null } | null;
}

export function ChannelsView() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchChannels();
  }, []);

  useEffect(() => {
    if (selectedChannel) {
      fetchPosts(selectedChannel.id);
      
      const channel = supabase
        .channel('posts-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'posts',
            filter: `channel_id=eq.${selectedChannel.id}`,
          },
          (payload) => {
            const newPost = payload.new as Post;
            setPosts((prev) => [...prev, newPost]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedChannel]);

  const fetchChannels = async () => {
    const { data, error } = await supabase
      .from("channels")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching channels:", error);
    } else {
      setChannels(data || []);
    }
  };

  const fetchPosts = async (channelId: string) => {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching posts:", error);
    } else {
      setPosts(data || []);
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !user) return;

    setLoading(true);
    const { error } = await supabase.from("channels").insert({
      name: newChannelName.trim(),
      description: newChannelDesc.trim() || null,
      creator_id: user.id,
    });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось создать канал",
        variant: "destructive",
      });
    } else {
      toast({ title: "Канал создан!" });
      setNewChannelName("");
      setNewChannelDesc("");
      setShowCreateModal(false);
      fetchChannels();
    }
    setLoading(false);
  };

  const sendPost = async () => {
    if (!newPost.trim() || !selectedChannel || !user) return;

    const { error } = await supabase.from("posts").insert({
      content: newPost.trim(),
      channel_id: selectedChannel.id,
      author_id: user.id,
    });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось отправить сообщение",
        variant: "destructive",
      });
    } else {
      setNewPost("");
    }
  };

  if (selectedChannel) {
    return (
      <div className="flex flex-col h-full">
        {/* Channel Header */}
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedChannel(null)}
              className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Hash className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">{selectedChannel.name}</h2>
              {selectedChannel.description && (
                <p className="text-sm text-muted-foreground truncate">
                  {selectedChannel.description}
                </p>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Posts */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {posts.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Hash className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Сообщений пока нет</p>
              <p className="text-sm">Будьте первым!</p>
            </div>
          ) : (
            posts.map((post) => (
              <GlassCard key={post.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {post.author_id === user?.id ? "Вы" : "Пользователь"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(post.created_at), {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm break-words">{post.content}</p>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>

        {/* Input */}
        <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
          <div className="flex gap-2">
            <FlameInput
              placeholder="Написать сообщение..."
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendPost()}
              className="flex-1"
            />
            <FlameButton onClick={sendPost} size="md">
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
        <h2 className="text-xl font-bold">Каналы</h2>
        <FlameButton onClick={() => setShowCreateModal(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Создать
        </FlameButton>
      </div>

      {channels.length === 0 ? (
        <GlassCard className="text-center py-12">
          <Hash className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">Каналов пока нет</h3>
          <p className="text-muted-foreground mb-4">
            Создайте первый канал для общения!
          </p>
          <FlameButton onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Создать канал
          </FlameButton>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {channels.map((channel) => (
            <GlassCard
              key={channel.id}
              className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedChannel(channel)}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Hash className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{channel.name}</h3>
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
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md p-6" glow>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Создать канал</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <FlameInput
                label="Название канала"
                placeholder="Например: Общение"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
              <FlameInput
                label="Описание (опционально)"
                placeholder="О чём этот канал?"
                value={newChannelDesc}
                onChange={(e) => setNewChannelDesc(e.target.value)}
              />
              <FlameButton
                onClick={createChannel}
                className="w-full"
                disabled={!newChannelName.trim() || loading}
              >
                {loading ? "Создание..." : "Создать канал"}
              </FlameButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
