import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { ArrowLeft, MessageCircle, Calendar, UserPlus, UserMinus, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FeedPostCard, FeedPost } from "@/components/views/FeedView";

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  user_id: string;
  created_at: string;
  display_name: string | null;
  messages_privacy?: "everyone" | "followers";
}

interface UserProfileViewProps {
  userId: string;
  onBack: () => void;
  onStartChat: (userId: string) => void;
}

export function UserProfileView({ userId, onBack, onStartChat }: UserProfileViewProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);

  const isOwnProfile = user?.id === userId;

  useEffect(() => { fetchAll(); }, [userId]);

  const fetchAll = async () => {
    setLoading(true);
    const { data: profileData } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    setProfile(profileData as any);

    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
    ]);
    setFollowerCount(followers || 0);
    setFollowingCount(following || 0);

    if (user && !isOwnProfile) {
      const { data: f } = await supabase.from("user_follows").select("follower_id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle();
      setIsFollowing(!!f);
    }

    await fetchPosts();
    setLoading(false);
  };

  const fetchPosts = async () => {
    const { data: postsData } = await supabase.from("feed_posts").select("*").eq("author_id", userId).order("created_at", { ascending: false }).limit(50);
    if (!postsData || postsData.length === 0) { setPosts([]); return; }
    const postIds = postsData.map(p => p.id);
    const [likesRes, commentsRes, myLikesRes] = await Promise.all([
      supabase.from("feed_likes").select("post_id").in("post_id", postIds),
      supabase.from("feed_comments").select("post_id").in("post_id", postIds),
      user ? supabase.from("feed_likes").select("post_id").in("post_id", postIds).eq("user_id", user.id) : Promise.resolve({ data: [] } as any),
    ]);
    const likeMap = new Map<string, number>();
    const commentMap = new Map<string, number>();
    const mineSet = new Set((myLikesRes.data || []).map((l: any) => l.post_id));
    (likesRes.data || []).forEach((l: any) => likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1));
    (commentsRes.data || []).forEach((c: any) => commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1));

    setPosts(postsData.map((p: any) => ({
      ...p,
      author_username: profile?.username || null,
      author_display_name: profile?.display_name || null,
      author_avatar_url: profile?.avatar_url || null,
      likes_count: likeMap.get(p.id) || 0,
      comments_count: commentMap.get(p.id) || 0,
      liked_by_me: mineSet.has(p.id),
    })));
  };

  const toggleFollow = async () => {
    if (!user || isOwnProfile) return;
    setFollowBusy(true);
    if (isFollowing) {
      await supabase.from("user_follows").delete().eq("follower_id", user.id).eq("following_id", userId);
      setIsFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from("user_follows").insert({ follower_id: user.id, following_id: userId });
      setIsFollowing(true);
      setFollowerCount(c => c + 1);
    }
    setFollowBusy(false);
  };

  const handleMessage = async () => {
    if (!user || !profile) return;
    const privacy = profile.messages_privacy || "everyone";
    if (privacy === "followers") {
      const { data } = await supabase.rpc("is_mutual_follow", { _a: user.id, _b: userId });
      if (!data) {
        toast({ title: t("messageBlocked"), description: t("messageBlockedDesc"), variant: "destructive" });
        return;
      }
    }
    onStartChat(userId);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!profile) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground mb-4"><ArrowLeft className="w-5 h-5" /> {t("back")}</button>
        <GlassCard className="text-center py-12"><p className="text-muted-foreground">{t("profileNotFound")}</p></GlassCard>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground"><ArrowLeft className="w-5 h-5" /> {t("back")}</button>

      <GlassCard className="p-8 text-center" glow>
        <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} size="xl" className="mx-auto mb-4 neon-glow" />
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <h2 className="text-xl font-bold">{profile.display_name || profile.username || t("noName")}</h2>
          <UserBadge userId={userId} />
        </div>
        {profile.username && <p className="text-sm text-primary/80 mb-2">@{profile.username.replace(/^@/, "")}</p>}
        {profile.bio && <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">{profile.bio}</p>}
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 mb-4">
          <Calendar className="w-4 h-4" /> {t("inFlameSince")} {new Date(profile.created_at).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}
        </p>

        <div className="flex justify-center gap-8 text-sm mb-4">
          <div className="text-center"><div className="font-bold text-base">{followerCount}</div><div className="text-xs text-muted-foreground">{t("followers")}</div></div>
          <div className="text-center"><div className="font-bold text-base">{followingCount}</div><div className="text-xs text-muted-foreground">{t("following")}</div></div>
          <div className="text-center"><div className="font-bold text-base">{posts.length}</div><div className="text-xs text-muted-foreground">{t("posts")}</div></div>
        </div>

        {!isOwnProfile && (
          <div className="flex gap-2 max-w-xs mx-auto">
            <FlameButton onClick={toggleFollow} disabled={followBusy} variant={isFollowing ? "outline" : "primary"} className="flex-1">
              {isFollowing ? <><UserMinus className="w-4 h-4 mr-1" /> {t("unfollow")}</> : <><UserPlus className="w-4 h-4 mr-1" /> {t("follow")}</>}
            </FlameButton>
            <FlameButton onClick={handleMessage} variant="outline" className="flex-1">
              {profile.messages_privacy === "followers" && !isFollowing ? <Lock className="w-4 h-4 mr-1" /> : <MessageCircle className="w-4 h-4 mr-1" />}
              {t("message")}
            </FlameButton>
          </div>
        )}
      </GlassCard>

      <div>
        <h3 className="font-semibold mb-3">{t("posts")} ({posts.length})</h3>
        {posts.length === 0 ? (
          <GlassCard className="text-center py-8"><p className="text-muted-foreground">{t("noPosts")}</p></GlassCard>
        ) : (
          <div className="space-y-4">
            {posts.map(p => <FeedPostCard key={p.id} post={p} onAuthorClick={() => {}} onChanged={fetchPosts} />)}
          </div>
        )}
      </div>
    </div>
  );
}
