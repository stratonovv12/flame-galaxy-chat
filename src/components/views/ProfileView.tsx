import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { MediaUpload } from "@/components/ui/MediaUpload";
import { AdminPanelView } from "@/components/views/AdminPanelView";
import { LogOut, Settings, Mail, Shield, Wallet, Package, ArrowLeftRight, Globe, Plus, Heart, MessageCircle, Trash2, Image } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";

interface ProfileViewProps {
  onNavigate?: (tab: string) => void;
}

interface SocialPost {
  id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
}

export function ProfileView({ onNavigate }: ProfileViewProps) {
  const { user, signOut, isAdmin } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const dateLocale = lang === "ru" ? ru : enUS;
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [steamTradeUrl, setSteamTradeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Social feed
  const [activeTab, setActiveTab] = useState<"settings" | "posts">("settings");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [postingLoading, setPostingLoading] = useState(false);

  useEffect(() => { if (user) { fetchProfile(); fetchPosts(); } }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("username, display_name, avatar_url, bio, steam_trade_url").eq("user_id", user.id).maybeSingle();
    if (data) { setUsername(data.username || ""); setDisplayName(data.display_name || ""); setAvatarUrl(data.avatar_url || ""); setBio(data.bio || ""); setSteamTradeUrl(data.steam_trade_url || ""); }
    else if (!error) { await supabase.from("profiles").insert({ user_id: user.id, username: "" }); }
    setLoading(false);
  };

  const fetchPosts = async () => {
    if (!user) return;
    const { data: postsData } = await supabase.from("profile_posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (!postsData) return;

    const postIds = postsData.map(p => p.id);
    const [{ data: likes }, { data: comments }, { data: myLikes }] = await Promise.all([
      supabase.from("post_likes").select("post_id").in("post_id", postIds),
      supabase.from("post_comments").select("post_id").in("post_id", postIds),
      supabase.from("post_likes").select("post_id").in("post_id", postIds).eq("user_id", user.id),
    ]);

    const likesMap = new Map<string, number>();
    const commentsMap = new Map<string, number>();
    const myLikesSet = new Set(myLikes?.map(l => l.post_id) || []);
    likes?.forEach(l => likesMap.set(l.post_id, (likesMap.get(l.post_id) || 0) + 1));
    comments?.forEach(c => commentsMap.set(c.post_id, (commentsMap.get(c.post_id) || 0) + 1));

    setPosts(postsData.map(p => ({
      id: p.id,
      caption: p.caption,
      image_url: p.image_url,
      created_at: p.created_at,
      likes_count: likesMap.get(p.id) || 0,
      comments_count: commentsMap.get(p.id) || 0,
      liked_by_me: myLikesSet.has(p.id),
    })));
  };

  const createPost = async () => {
    if (!user || (!newCaption.trim() && !newImageUrl)) return;
    setPostingLoading(true);
    const { error } = await supabase.from("profile_posts").insert({ user_id: user.id, caption: newCaption.trim() || null, image_url: newImageUrl || null });
    if (error) { toast({ title: t("error"), description: t("sendFailed"), variant: "destructive" }); }
    else { toast({ title: t("postPublished") }); setNewCaption(""); setNewImageUrl(""); setShowNewPost(false); fetchPosts(); }
    setPostingLoading(false);
  };

  const toggleLike = async (postId: string, liked: boolean) => {
    if (!user) return;
    if (liked) { await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id); }
    else { await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id }); }
    fetchPosts();
  };

  const deletePost = async (postId: string) => {
    await supabase.from("profile_posts").delete().eq("id", postId);
    toast({ title: t("postDeleted") });
    fetchPosts();
  };

  const autoSave = useCallback(async (fields: Record<string, any>) => {
    if (!user) return;
    if (fields.username !== undefined) {
      const cleanName = fields.username.replace(/^@/, "").trim();
      if (cleanName) {
        const { data: existing } = await supabase.from("profiles").select("user_id").eq("username", cleanName).neq("user_id", user.id).maybeSingle();
        if (existing) { setUsernameError(t("usernameTaken")); return; }
      }
      setUsernameError("");
      fields.username = cleanName;
    }
    await supabase.from("profiles").update({ ...fields, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  }, [user, t]);

  const debouncedSave = useCallback((fields: Record<string, any>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(fields), 800);
  }, [autoSave]);

  const handleDisplayNameChange = (val: string) => { setDisplayName(val); debouncedSave({ display_name: val }); };
  const handleUsernameChange = (val: string) => { setUsername(val); setUsernameError(""); debouncedSave({ username: val }); };
  const handleBioChange = (val: string) => { setBio(val); debouncedSave({ bio: val }); };
  const handleAvatarUpload = (url: string) => { setAvatarUrl(url); autoSave({ avatar_url: url || null }); };
  const handleSteamUrlChange = (val: string) => { setSteamTradeUrl(val); debouncedSave({ steam_trade_url: val }); };

  if (showAdmin) {
    return (
      <div>
        <div className="p-4"><button onClick={() => setShowAdmin(false)} className="text-sm text-primary hover:underline">{t("backToProfile")}</button></div>
        <AdminPanelView />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold">{t("profile")}</h2>

      <GlassCard className="p-6" glow>
        <div className="flex flex-col items-center mb-6">
          <AvatarUpload currentUrl={avatarUrl} onUpload={handleAvatarUpload} />
          {(displayName || username) && (
            <div className="flex items-center gap-1.5 mt-4">
              <h3 className="text-lg font-semibold">{displayName || username}</h3>
              {user && <UserBadge userId={user.id} />}
            </div>
          )}
          {username && <p className="text-sm text-primary/80 mt-0.5">@{username.replace(/^@/, "")}</p>}
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1"><Mail className="w-4 h-4" />{user?.email}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border/50 pb-2">
          <button onClick={() => setActiveTab("settings")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "settings" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Settings className="w-4 h-4 inline mr-1" /> {t("settings")}
          </button>
          <button onClick={() => setActiveTab("posts")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "posts" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Image className="w-4 h-4 inline mr-1" /> {t("posts")}
          </button>
        </div>

        {activeTab === "settings" && (
          <div className="space-y-4">
            <FlameInput label={t("displayName")} placeholder={t("displayNamePlaceholder")} value={displayName} onChange={e => handleDisplayNameChange(e.target.value)} disabled={loading} />
            <FlameInput label="@Username" placeholder="unique_handle" value={username} onChange={e => handleUsernameChange(e.target.value)} disabled={loading} error={usernameError} />
            <div className="w-full">
              <label className="block text-sm font-medium text-foreground/80 mb-2">{t("aboutMe")}</label>
              <textarea className="w-full touch-target px-4 py-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 resize-none" placeholder={t("aboutMePlaceholder")} rows={3} value={bio} onChange={e => handleBioChange(e.target.value)} disabled={loading} />
            </div>
          </div>
        )}

        {activeTab === "posts" && (
          <div className="space-y-4">
            <FlameButton onClick={() => setShowNewPost(!showNewPost)} size="sm">
              <Plus className="w-4 h-4 mr-1" /> {t("newPost")}
            </FlameButton>

            {showNewPost && (
              <GlassCard className="p-4 space-y-3">
                <textarea className="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" placeholder={t("addCaption")} rows={2} value={newCaption} onChange={e => setNewCaption(e.target.value)} />
                <div className="flex items-center gap-3">
                  <MediaUpload onUpload={setNewImageUrl} />
                  {newImageUrl && <img src={newImageUrl} alt="" className="w-16 h-16 rounded-lg object-cover" />}
                </div>
                <FlameButton onClick={createPost} disabled={postingLoading || (!newCaption.trim() && !newImageUrl)} className="w-full">
                  {postingLoading ? t("loading") : t("send")}
                </FlameButton>
              </GlassCard>
            )}

            {posts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("noPosts")}</p>
            ) : (
              <div className="space-y-4">
                {posts.map(post => (
                  <GlassCard key={post.id} className="overflow-hidden">
                    {post.image_url && <img src={post.image_url} alt="" className="w-full max-h-80 object-cover" />}
                    <div className="p-4">
                      {post.caption && <p className="text-sm mb-2">{post.caption}</p>}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <button onClick={() => toggleLike(post.id, post.liked_by_me)} className={`flex items-center gap-1 text-sm transition-colors ${post.liked_by_me ? "text-red-400" : "text-muted-foreground hover:text-red-400"}`}>
                            <Heart className={`w-4 h-4 ${post.liked_by_me ? "fill-current" : ""}`} /> {post.likes_count}
                          </button>
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MessageCircle className="w-4 h-4" /> {post.comments_count}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: dateLocale })}</span>
                          <button onClick={() => deletePost(post.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Settings section */}
      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Settings className="w-5 h-5" />{t("settings")}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div><p className="font-medium">{t("email")}</p><p className="text-sm text-muted-foreground">{user?.email}</p></div>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div><p className="font-medium">{t("accountCreated")}</p><p className="text-sm text-muted-foreground">{user?.created_at ? new Date(user.created_at).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US") : "—"}</p></div>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" /><p className="font-medium">{t("language")}</p></div>
            <div className="flex gap-2">
              <button onClick={() => setLang("ru")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${lang === "ru" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>{t("russian")}</button>
              <button onClick={() => setLang("en")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${lang === "en" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>{t("english")}</button>
            </div>
          </div>
        </div>
      </GlassCard>

      {onNavigate && (
        <div className="grid grid-cols-3 gap-3">
          <FlameButton variant="outline" className="w-full" onClick={() => onNavigate("wallet")}><Wallet className="w-4 h-4 mr-2" /> {t("wallet")}</FlameButton>
          <FlameButton variant="outline" className="w-full" onClick={() => onNavigate("inventory")}><Package className="w-4 h-4 mr-2" /> {t("inventory")}</FlameButton>
          <FlameButton variant="outline" className="w-full" onClick={() => onNavigate("trades")}><ArrowLeftRight className="w-4 h-4 mr-2" /> {t("trades")}</FlameButton>
        </div>
      )}

      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">🎮 {t("steamIntegration")}</h3>
        <FlameInput label="Steam Trade URL" placeholder="https://steamcommunity.com/tradeoffer/new/?..." value={steamTradeUrl} onChange={e => handleSteamUrlChange(e.target.value)} disabled={loading} />
        <p className="text-xs text-muted-foreground mt-2">{t("steamRequired")}</p>
      </GlassCard>

      {isAdmin && (
        <FlameButton onClick={() => setShowAdmin(true)} className="w-full" variant="outline"><Shield className="w-4 h-4 mr-2" />{t("adminPanel")}</FlameButton>
      )}

      <FlameButton variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={signOut}>
        <LogOut className="w-4 h-4 mr-2" />{t("logout")}
      </FlameButton>
    </div>
  );
}
