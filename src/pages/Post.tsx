import { useEffect, useState } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Flame, ArrowLeft } from "lucide-react";
import { FlameButton } from "@/components/ui/FlameButton";
import { useLanguage } from "@/contexts/LanguageContext";

const Post = () => {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [author, setAuthor] = useState<any>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: p } = await supabase.from("feed_posts").select("*").eq("id", id).maybeSingle();
      if (p) {
        setPost(p);
        const { data: a } = await supabase.from("profiles").select("user_id, username, display_name, avatar_url").eq("user_id", p.author_id).maybeSingle();
        setAuthor(a);
      }
      setFetching(false);
    })();
  }, [id]);

  if (loading || fetching) {
    return <div className="min-h-screen cosmic-bg flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  if (!user) {
    // Register-gated: store redirect target and send to /auth
    sessionStorage.setItem("flame_post_redirect", `/p/${id}`);
    return <Navigate to="/auth" replace />;
  }

  if (!post) {
    return <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
      <GlassCard className="p-8 text-center max-w-md">
        <Flame className="w-12 h-12 text-primary/50 mx-auto mb-3" />
        <h2 className="text-lg font-bold mb-2">{t("postNotFound" as any) || "Post not found"}</h2>
        <FlameButton onClick={() => navigate("/")} size="sm">{t("backToFeed" as any) || "Back to feed"}</FlameButton>
      </GlassCard>
    </div>;
  }

  return (
    <div className="min-h-screen cosmic-bg p-4">
      <button onClick={() => navigate("/")} className="flex items-center gap-2 mb-4 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> {t("backToFeed" as any) || "Back to feed"}
      </button>
      <div className="max-w-2xl mx-auto">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <UserAvatar username={author?.username} avatarUrl={author?.avatar_url} size="md" />
            <div>
              <p className="font-semibold text-sm">{author?.display_name || author?.username || "—"}</p>
              {author?.username && <p className="text-xs text-muted-foreground">@{author.username.replace(/^@/, "")}</p>}
            </div>
          </div>
          {post.content && <p className="text-sm mb-3 whitespace-pre-wrap break-words">{post.content}</p>}
          {post.media_url && (
            post.media_type === "video"
              ? <video src={post.media_url} controls playsInline className="w-full max-h-[60vh] rounded-lg bg-black" />
              : <img src={post.media_url} alt="" className="w-full max-h-[60vh] object-cover rounded-lg" />
          )}
        </GlassCard>
      </div>
    </div>
  );
};

export default Post;
