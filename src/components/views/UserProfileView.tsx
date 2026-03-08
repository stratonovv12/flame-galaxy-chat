import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { ArrowLeft, MessageCircle, Calendar, Hash, Package, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  user_id: string;
  created_at: string;
  display_name: string | null;
  inventory_visibility?: string;
}

interface Post {
  id: string;
  content: string;
  media_url: string | null;
  created_at: string;
  channel_id: string;
  channel_name?: string;
}

interface InventoryItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  acquired_at: string;
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
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"posts" | "inventory">("posts");
  const [inventoryAccessible, setInventoryAccessible] = useState(false);

  useEffect(() => { fetchUserData(); }, [userId]);

  const fetchUserData = async () => {
    setLoading(true);
    const { data: profileData } = await supabase
      .from("profiles").select("*").eq("user_id", userId).maybeSingle();
    setProfile(profileData as Profile | null);

    // Fetch posts
    const { data: postsData } = await supabase
      .from("posts")
      .select("id, content, media_url, created_at, channel_id")
      .eq("author_id", userId)
      .not("media_url", "is", null)
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

    // Check inventory visibility
    const visibility = (profileData as any)?.inventory_visibility || "public";
    const isOwn = user?.id === userId;
    const canSee = isOwn || visibility === "public";
    setInventoryAccessible(canSee);

    if (canSee) {
      const { data: invData } = await supabase
        .from("user_inventory")
        .select("id, title, description, image_url, acquired_at")
        .eq("owner_id", userId)
        .order("acquired_at", { ascending: false });
      setInventory((invData as InventoryItem[]) || []);
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
          <ArrowLeft className="w-5 h-5" /> Назад
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
        <ArrowLeft className="w-5 h-5" /> Назад
      </button>

      <GlassCard className="p-8 text-center" glow>
        <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} size="xl" className="mx-auto mb-4 neon-glow" />
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <h2 className="text-xl font-bold">{profile.display_name || profile.username || "Без имени"}</h2>
          <UserBadge userId={userId} />
        </div>
        {profile.username && <p className="text-sm text-primary/80 mb-2">@{profile.username.replace(/^@/, "")}</p>}
        {profile.bio && <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">{profile.bio}</p>}
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 mb-4">
          <Calendar className="w-4 h-4" />
          В FLAME с {new Date(profile.created_at).toLocaleDateString("ru-RU")}
        </p>
        {!isOwnProfile && (
          <FlameButton onClick={() => onStartChat(userId)} className="w-full max-w-xs mx-auto">
            <MessageCircle className="w-4 h-4 mr-2" /> Написать сообщение
          </FlameButton>
        )}
      </GlassCard>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("posts")}
          className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "posts" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Медиа ({posts.length})
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "inventory" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Package className="w-4 h-4" /> Инвентарь
          </span>
        </button>
      </div>

      {activeTab === "posts" && (
        <div>
          {posts.length === 0 ? (
            <GlassCard className="text-center py-8">
              <p className="text-muted-foreground">Нет медиа-публикаций</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {posts.map((post) => (
                <GlassCard key={post.id} className="p-2 cursor-pointer" onClick={() => post.media_url && window.open(post.media_url, "_blank")}>
                  {post.media_url && (
                    post.media_url.match(/\.(mp4|webm|mov)/) ? (
                      <video src={post.media_url} className="w-full aspect-square rounded-lg object-cover" />
                    ) : (
                      <img src={post.media_url} alt="" className="w-full aspect-square rounded-lg object-cover" />
                    )
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 px-1">
                    <Hash className="w-3 h-3" />
                    <span className="truncate">{post.channel_name}</span>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "inventory" && (
        <div>
          {!inventoryAccessible ? (
            <GlassCard className="text-center py-12">
              <Lock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">Инвентарь скрыт владельцем</p>
            </GlassCard>
          ) : inventory.length === 0 ? (
            <GlassCard className="text-center py-8">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">Инвентарь пуст</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {inventory.map((item) => (
                <GlassCard key={item.id} className="overflow-hidden">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.title} className="w-full h-28 object-cover" />
                  )}
                  <div className="p-3">
                    <h4 className="font-semibold text-sm">{item.title}</h4>
                    {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
