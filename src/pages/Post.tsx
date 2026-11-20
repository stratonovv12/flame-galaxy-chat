import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { Flame, ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { FeedPostCard, CommentsModal, type FeedPost } from "@/components/views/FeedView";

const Post = () => {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [fetching, setFetching] = useState(true);
  const [showComments, setShowComments] = useState(false);

  const fetchPost = useCallback(async () => {
    if (!id || !user) return;
    setFetching(true);
    const { data: p } = await supabase.from("feed_posts").select("*").eq("id", id).maybeSingle();
    if (!p) { setPost(null); setFetching(false); return; }
    const [{ data: author }, { data: likes }, { data: comments }, { data: myLike }] = await Promise.all([
      supabase.from("profiles").select("user_id, username, display_name, avatar_url").eq("user_id", p.author_id).maybeSingle(),
      supabase.from("feed_likes").select("post_id").eq("post_id", p.id),
      supabase.from("feed_comments").select("post_id").eq("post_id", p.id),
      supabase.from("feed_likes").select("post_id").eq("post_id", p.id).eq("user_id", user.id).maybeSingle(),
    ]);
    setPost({
      id: p.id,
      author_id: p.author_id,
      content: p.content,
      media_url: p.media_url,
      media_type: p.media_type as any,
      created_at: p.created_at,
      author_username: author?.username || null,
      author_display_name: (author as any)?.display_name || null,
      author_avatar_url: author?.avatar_url || null,
      likes_count: likes?.length || 0,
      comments_count: comments?.length || 0,
      liked_by_me: !!myLike,
    });
    setFetching(false);
  }, [id, user]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`shared-post-${id}-${crypto.randomUUID()}`).on("postgres_changes", { event: "*", schema: "public", table: "feed_posts", filter: `id=eq.${id}` }, () => void fetchPost()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, fetchPost]);

  if (loading || fetching) {
    return <div className="h-full flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  if (!post) {
    return <div className="h-full flex items-center justify-center p-4">
      <GlassCard className="p-8 text-center max-w-md">
        <Flame className="w-12 h-12 text-primary/50 mx-auto mb-3" />
        <h2 className="text-lg font-bold mb-2">{(t as any)("postNotFound") || "Post not found"}</h2>
        <FlameButton onClick={() => navigate("/")} size="sm">{(t as any)("backToFeed") || "Back to feed"}</FlameButton>
      </GlassCard>
    </div>;
  }

  return (
    <div className="p-4">
      <button onClick={() => navigate("/")} className="flex items-center gap-2 mb-4 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> {(t as any)("backToFeed") || "Back to feed"}
      </button>
      <div className="max-w-2xl mx-auto">
        <FeedPostCard
          post={post}
          onAuthorClick={() => navigate(`/users/${post.author_id}`)}
          onChanged={fetchPost}
          onOpenComments={() => setShowComments(true)}
        />
      </div>
      {showComments && (
        <CommentsModal
          post={post}
          onClose={() => { setShowComments(false); fetchPost(); }}
          onViewProfile={() => navigate("/")}
        />
      )}
    </div>
  );
};

export default Post;
