import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { ArrowLeft, MessageCircle, Calendar, Hash, AtSign } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  user_id: string;
  created_at: string;
}

interface Post {
  id: string;
  content: string;
  created_at: string;
  channel_id: string;
  channel_name?: string;
}

interface UserProfileViewProps {
  userId: string;
  onBack: () => void;
  onStartChat: (userId: string) => void;
}

export function UserProfileView({ userId, onBack, onStartChat }: UserProfileViewProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, [userId]);

  const fetchUserData = async () => {
    setLoading(true);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    setProfile(profileData);

    const { data: postsData } = await supabase
      .from("posts")
      .select("id, content, created_at, channel_id")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (postsData && postsData.length > 0) {
      const channelIds = [...new Set(postsData.map((p) => p.channel_id))];
      const { data: channelsData } = await supabase.from("channels").select("id, name").in("id", channelIds);
      const channelMap = new Map(channelsData?.map((c) => [c.id, c.name]) || []);
      setPosts(postsData.map((p) => ({ ...p, channel_name: channelMap.get(p.channel_id) || "Удалённый канал" })));
    } else {
      setPosts([]);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground mb-4">
          <ArrowLeft className="w-5 h-5" />
          Назад
        </button>
        <GlassCard className="text-center py-12">
          <p className="text-muted-foreground">Профиль не найден</p>
        </GlassCard>
      </div>
    );
  }

  const isOwnProfile = user?.id === userId;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground">
        <ArrowLeft className="w-5 h-5" />
        Назад
      </button>

      <GlassCard className="p-8 text-center" glow>
        <UserAvatar
          username={profile.username}
          avatarUrl={profile.avatar_url}
          size="xl"
          className="mx-auto mb-4 neon-glow"
        />
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <h2 className="text-xl font-bold">{profile.username || "Без имени"}</h2>
          <UserBadge userId={userId} />
        </div>
        {profile.username && (
          <p className="text-sm text-primary/80 mb-2">@{profile.username.replace(/^@/, "")}</p>
        )}
        {profile.bio && (
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">{profile.bio}</p>
        )}
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 mb-4">
          <Calendar className="w-4 h-4" />
          В FLAME с {new Date(profile.created_at).toLocaleDateString("ru-RU")}
        </p>

        {!isOwnProfile && (
          <FlameButton onClick={() => onStartChat(userId)} className="w-full max-w-xs mx-auto">
            <MessageCircle className="w-4 h-4 mr-2" />
            Написать сообщение
          </FlameButton>
        )}
      </GlassCard>

      <div>
        <h3 className="text-lg font-semibold mb-3">Публикации ({posts.length})</h3>
        {posts.length === 0 ? (
          <GlassCard className="text-center py-8">
            <p className="text-muted-foreground">Нет публикаций</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <GlassCard key={post.id} className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Hash className="w-3 h-3" />
                  <span>{post.channel_name}</span>
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ru })}</span>
                </div>
                <p className="text-sm">{post.content}</p>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
