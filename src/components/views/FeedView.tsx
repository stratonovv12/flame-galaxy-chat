import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { Heart, MessageCircle, Trash2, Plus, Image as ImageIcon, Video as VideoIcon, X, Filter, Send, Share2, Repeat2 } from "lucide-react";
import { FlameMoments } from "@/components/ui/FlameMoments";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

export interface FeedPost {
  id: string;
  author_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  created_at: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
}

type FilterMode = "newest" | "last24" | "trending" | "following";

const MAX_MEDIA_MB = 50;

interface FeedViewProps {
  onViewProfile: (userId: string) => void;
}

export function FeedView({ onViewProfile }: FeedViewProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("newest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [userFilter, setUserFilter] = useState<{ id: string; name: string } | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);

  const [showComposer, setShowComposer] = useState(false);
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [activePost, setActivePost] = useState<FeedPost | null>(null);

  const dateLocale = lang === "ru" ? ru : enUS;

  useEffect(() => { fetchPosts(); }, [filter, userFilter, user]);

  useEffect(() => {
    const channel = supabase.channel("feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, () => fetchPosts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter, userFilter]);

  const fetchPosts = async () => {
    setLoading(true);
    let q = supabase.from("feed_posts").select("*").order("created_at", { ascending: false }).limit(100);

    if (filter === "last24") {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      q = q.gte("created_at", since);
    }
    if (userFilter) q = q.eq("author_id", userFilter.id);
    if (filter === "following" && user) {
      const { data: follows } = await supabase.from("user_follows").select("following_id").eq("follower_id", user.id);
      const ids = (follows || []).map(f => f.following_id);
      if (ids.length === 0) { setPosts([]); setLoading(false); return; }
      q = q.in("author_id", ids);
    }

    const { data: postsData } = await q;
    if (!postsData || postsData.length === 0) { setPosts([]); setLoading(false); return; }

    const authorIds = [...new Set(postsData.map((p: any) => p.author_id))];
    const postIds = postsData.map((p: any) => p.id);

    const [profilesRes, likesRes, commentsRes, myLikesRes] = await Promise.all([
      supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", authorIds),
      supabase.from("feed_likes").select("post_id").in("post_id", postIds),
      supabase.from("feed_comments").select("post_id").in("post_id", postIds),
      user ? supabase.from("feed_likes").select("post_id").in("post_id", postIds).eq("user_id", user.id) : Promise.resolve({ data: [] } as any),
    ]);

    const profileMap = new Map<string, any>((profilesRes.data || []).map((p: any) => [p.user_id, p]));
    const likeMap = new Map<string, number>();
    const commentMap = new Map<string, number>();
    const mineSet = new Set((myLikesRes.data || []).map((l: any) => l.post_id));
    (likesRes.data || []).forEach((l: any) => likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1));
    (commentsRes.data || []).forEach((c: any) => commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1));

    let enriched: FeedPost[] = postsData.map((p: any) => {
      const prof = profileMap.get(p.author_id) || {};
      return {
        ...p,
        author_username: prof.username || null,
        author_display_name: prof.display_name || null,
        author_avatar_url: prof.avatar_url || null,
        likes_count: likeMap.get(p.id) || 0,
        comments_count: commentMap.get(p.id) || 0,
        liked_by_me: mineSet.has(p.id),
      };
    });

    if (filter === "trending") {
      enriched.sort((a, b) => (b.likes_count + b.comments_count * 2) - (a.likes_count + a.comments_count * 2));
    }
    setPosts(enriched);
    setLoading(false);
  };

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setUserResults([]); return; }
    const clean = q.replace(/[%_\\]/g, "\\$&").replace(/^@/, "");
    const { data } = await supabase.from("profiles").select("user_id, username, display_name, avatar_url")
      .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`).limit(8);
    setUserResults(data || []);
  }, []);

  useEffect(() => { searchUsers(userSearch); }, [userSearch, searchUsers]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isImg = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImg && !isVid) { toast({ title: t("error"), description: t("mediaTypeUnsupported"), variant: "destructive" }); return; }
    if (f.size > MAX_MEDIA_MB * 1024 * 1024) { toast({ title: t("error"), description: `Max ${MAX_MEDIA_MB}MB`, variant: "destructive" }); return; }
    setMediaFile(f);
    setMediaType(isImg ? "image" : "video");
    const reader = new FileReader();
    reader.onload = (ev) => setMediaPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const clearMedia = () => {
    setMediaFile(null); setMediaPreview(null); setMediaType(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Extract first frame of video to image for NSFW moderation
  const extractVideoFrame = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url; video.muted = true; video.playsInline = true; video.crossOrigin = "anonymous";
    video.addEventListener("loadeddata", () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 3); });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("ctx")); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      resolve(data);
    });
    video.addEventListener("error", () => { URL.revokeObjectURL(url); reject(new Error("video-load")); });
  });

  const moderateImage = async (publicImageUrl: string): Promise<{ safe: boolean; reason?: string }> => {
    const { data, error } = await supabase.functions.invoke("moderate-content", { body: { imageUrl: publicImageUrl } });
    if (error) return { safe: true, reason: "moderation-fail-open" };
    return data as any;
  };

  const createPost = async () => {
    if (!user) return;
    if (!content.trim() && !mediaFile) return;
    setPosting(true);
    try {
      let mediaUrl: string | null = null;
      let chosenType: "image" | "video" | null = null;

      if (mediaFile) {
        const ext = mediaFile.name.split(".").pop() || "bin";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, mediaFile, { upsert: true, cacheControl: "3600" });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
        mediaUrl = urlData.publicUrl;
        chosenType = mediaType;

        // NSFW moderation
        let imageToCheck = mediaUrl;
        if (chosenType === "video") {
          try {
            const frame = await extractVideoFrame(mediaFile);
            // Upload frame so moderator can fetch via URL
            const frameBlob = await (await fetch(frame)).blob();
            const framePath = `${user.id}/_mod_${Date.now()}.jpg`;
            await supabase.storage.from("media").upload(framePath, frameBlob, { upsert: true, contentType: "image/jpeg" });
            imageToCheck = supabase.storage.from("media").getPublicUrl(framePath).data.publicUrl;
          } catch (e) {
            console.warn("frame-extract-failed", e);
          }
        }

        const mod = await moderateImage(imageToCheck);
        if (!mod.safe) {
          // Delete uploaded media on rejection
          await supabase.storage.from("media").remove([path]);
          toast({ title: t("nsfwBlocked"), description: t("nsfwBlockedDesc"), variant: "destructive" });
          setPosting(false);
          return;
        }
      }

      const { error } = await supabase.from("feed_posts").insert({
        author_id: user.id,
        content: content.trim() || null,
        media_url: mediaUrl,
        media_type: chosenType,
      });
      if (error) throw error;
      toast({ title: t("postPublished") });
      setContent(""); clearMedia(); setShowComposer(false);
      fetchPosts();
    } catch (e: any) {
      toast({ title: t("error"), description: e.message || "publish failed", variant: "destructive" });
    } finally { setPosting(false); }
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground/80">{t("flameMoments")}</h3>
        </div>
        <FlameMoments />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t("feed")}</h2>
        <div className="flex gap-2">
          <button onClick={() => setFilterOpen(!filterOpen)} className="p-2 rounded-lg bg-muted/50 hover:bg-muted text-foreground"><Filter className="w-4 h-4" /></button>
          <FlameButton size="sm" onClick={() => setShowComposer(!showComposer)}><Plus className="w-4 h-4 mr-1" /> {t("newPost")}</FlameButton>
        </div>
      </div>

      {filterOpen && (
        <GlassCard className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "newest", label: t("filterNewest") },
              { id: "last24", label: t("filterLast24") },
              { id: "trending", label: t("filterTrending") },
              { id: "following", label: t("filterFollowing") },
            ].map(o => (
              <button key={o.id} onClick={() => setFilter(o.id as FilterMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === o.id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <div>
            <FlameInput placeholder={t("filterByUser")} value={userFilter ? userFilter.name : userSearch}
              onChange={(e) => { setUserFilter(null); setUserSearch(e.target.value); }} />
            {!userFilter && userResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {userResults.map((u: any) => (
                  <button key={u.user_id} onClick={() => { setUserFilter({ id: u.user_id, name: u.display_name || u.username || "?" }); setUserSearch(""); setUserResults([]); }}
                    className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/30 text-left">
                    <UserAvatar username={u.username} avatarUrl={u.avatar_url} size="sm" />
                    <span className="text-sm">{u.display_name || u.username}</span>
                  </button>
                ))}
              </div>
            )}
            {userFilter && (
              <button onClick={() => setUserFilter(null)} className="text-xs text-primary mt-1 hover:underline">{t("clearFilter")}</button>
            )}
          </div>
        </GlassCard>
      )}

      {showComposer && (
        <GlassCard className="p-4 space-y-3">
          <textarea className="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            placeholder={t("whatsHappening")} rows={3} value={content} onChange={e => setContent(e.target.value)} />
          {mediaPreview && (
            <div className="relative inline-block">
              {mediaType === "video" ? <video src={mediaPreview} className="max-h-40 rounded-lg" /> : <img src={mediaPreview} className="max-h-40 rounded-lg" />}
              <button onClick={clearMedia} className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"><X className="w-3 h-3" /></button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"><ImageIcon className="w-5 h-5" /></button>
            <FlameButton onClick={createPost} disabled={posting || (!content.trim() && !mediaFile)} className="ml-auto" size="sm">
              {posting ? t("publishing") : <><Send className="w-3.5 h-3.5 mr-1" /> {t("publish")}</>}
            </FlameButton>
          </div>
          {mediaFile && <p className="text-xs text-muted-foreground">{t("nsfwNotice")}</p>}
        </GlassCard>
      )}

      {loading ? (
        <div className="text-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : posts.length === 0 ? (
        <GlassCard className="text-center py-12"><p className="text-muted-foreground">{t("noPostsYet")}</p></GlassCard>
      ) : (
        <div className="space-y-4">
          {posts.map(p => <FeedPostCard key={p.id} post={p} onAuthorClick={() => onViewProfile(p.author_id)} onChanged={fetchPosts} onOpenComments={() => setActivePost(p)} />)}
        </div>
      )}

      {activePost && <CommentsModal post={activePost} onClose={() => { setActivePost(null); fetchPosts(); }} onViewProfile={onViewProfile} />}
    </div>
  );
}

interface FeedPostCardProps {
  post: FeedPost;
  onAuthorClick?: () => void;
  onChanged?: () => void;
  onOpenComments?: () => void;
}

export function FeedPostCard({ post, onAuthorClick, onChanged, onOpenComments }: FeedPostCardProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "ru" ? ru : enUS;
  const [liking, setLiking] = useState(false);

  const toggleLike = async () => {
    if (!user || liking) return;
    setLiking(true);
    if (post.liked_by_me) {
      await supabase.from("feed_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      await supabase.from("feed_likes").insert({ post_id: post.id, user_id: user.id });
    }
    setLiking(false);
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!confirm(t("deletePostConfirm"))) return;
    await supabase.from("feed_posts").delete().eq("id", post.id);
    toast({ title: t("postDeleted") });
    onChanged?.();
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3 mb-3">
        <button onClick={onAuthorClick}>
          <UserAvatar username={post.author_username} avatarUrl={post.author_avatar_url} size="md" />
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={onAuthorClick} className="flex items-center gap-1.5">
            <span className="font-semibold text-sm">{post.author_display_name || post.author_username || "—"}</span>
            <UserBadge userId={post.author_id} />
          </button>
          {post.author_username && <p className="text-xs text-muted-foreground">@{post.author_username.replace(/^@/, "")}</p>}
        </div>
        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: dateLocale })}</span>
        {user?.id === post.author_id && (
          <button onClick={handleDelete} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>
      {post.content && <p className="text-sm mb-3 whitespace-pre-wrap break-words">{post.content}</p>}
      {post.media_url && (
        post.media_type === "video"
          ? <video src={post.media_url} controls playsInline className="w-full max-h-[480px] rounded-lg bg-black mb-3" />
          : <img src={post.media_url} alt="" className="w-full max-h-[480px] object-cover rounded-lg mb-3" />
      )}
      <div className="flex items-center gap-5 text-sm flex-wrap">
        <button onClick={toggleLike} className={`flex items-center gap-1 transition-colors ${post.liked_by_me ? "text-red-400" : "text-muted-foreground hover:text-red-400"}`}>
          <Heart className={`w-4 h-4 ${post.liked_by_me ? "fill-current" : ""}`} /> {post.likes_count}
        </button>
        <button onClick={onOpenComments} className="flex items-center gap-1 text-muted-foreground hover:text-primary">
          <MessageCircle className="w-4 h-4" /> {post.comments_count}
        </button>
        <button
          onClick={async () => {
            if (!user) return;
            const { error } = await supabase.from("feed_posts").insert({
              author_id: user.id,
              content: null,
              media_url: post.media_url,
              media_type: post.media_type,
              repost_of: post.id,
            } as any);
            if (error) toast({ title: t("error"), description: error.message, variant: "destructive" });
            else { toast({ title: t("reposted" as any) || "Reposted" }); onChanged?.(); }
          }}
          className="flex items-center gap-1 text-muted-foreground hover:text-primary"
          title={t("repost" as any) || "Repost"}
        >
          <Repeat2 className="w-4 h-4" />
        </button>
        <button
          onClick={async () => {
            const link = `${window.location.origin}/p/${post.id}`;
            try {
              if (navigator.share) {
                await navigator.share({ title: t("flame" as any) || "Flame", text: post.content || "", url: link });
              } else {
                await navigator.clipboard.writeText(link);
                toast({ title: t("linkCopied" as any) || "Link copied" });
              }
            } catch {}
          }}
          className="flex items-center gap-1 text-muted-foreground hover:text-primary ml-auto"
          title={t("share" as any) || "Share"}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>
    </GlassCard>
  );
}

interface Comment {
  id: string; post_id: string; user_id: string; content: string; created_at: string;
  username?: string | null; display_name?: string | null; avatar_url?: string | null;
}

function CommentsModal({ post, onClose, onViewProfile }: { post: FeedPost; onClose: () => void; onViewProfile: (id: string) => void }) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const dateLocale = lang === "ru" ? ru : enUS;
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { fetchComments(); }, [post.id]);

  const fetchComments = async () => {
    const { data } = await supabase.from("feed_comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
    if (!data) { setComments([]); return; }
    const ids = [...new Set(data.map(c => c.user_id))];
    const { data: profs } = await supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", ids);
    const map = new Map((profs || []).map(p => [p.user_id, p]));
    setComments(data.map(c => ({ ...c, ...(map.get(c.user_id) || {}) })));
  };

  const send = async () => {
    if (!user || !text.trim()) return;
    setSending(true);
    await supabase.from("feed_comments").insert({ post_id: post.id, user_id: user.id, content: text.trim() });
    setText("");
    await fetchComments();
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-lg sm:rounded-xl rounded-t-xl border border-border max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">{t("comments")}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {comments.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">{t("noComments")}</p>
          ) : comments.map(c => (
            <div key={c.id} className="flex gap-2">
              <button onClick={() => onViewProfile(c.user_id)}>
                <UserAvatar username={c.username} avatarUrl={c.avatar_url ?? null} size="sm" />
              </button>
              <div className="flex-1 bg-muted/30 rounded-lg px-3 py-2">
                <button onClick={() => onViewProfile(c.user_id)} className="text-xs font-medium">{c.display_name || c.username || "—"}</button>
                <p className="text-sm">{c.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: dateLocale })}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-border flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder={t("writeComment")}
            className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            onKeyDown={e => { if (e.key === "Enter") send(); }} />
          <FlameButton onClick={send} disabled={sending || !text.trim()} size="sm"><Send className="w-4 h-4" /></FlameButton>
        </div>
      </div>
    </div>
  );
}
