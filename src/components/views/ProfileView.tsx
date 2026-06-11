import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserBadge } from "@/components/ui/UserBadge";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { AdminPanelView } from "@/components/views/AdminPanelView";
import { LogOut, Settings, Mail, Shield, Globe, Users as UsersIcon, ArrowLeft, Volume2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { getVolume, setVolume as persistVolume, playNotificationSound } from "@/lib/notifications";

interface ProfileViewProps {
  onNavigate?: (tab: string) => void;
}

export function ProfileView({ onNavigate }: ProfileViewProps) {
  const { user, signOut, isAdmin } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [messagesPrivacy, setMessagesPrivacy] = useState<"everyone" | "followers">("everyone");
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [volume, setVolumeState] = useState(() => getVolume());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { if (user) { fetchProfile(); fetchFollowCounts(); } }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("profiles").select("username, display_name, avatar_url, bio, messages_privacy").eq("user_id", user.id).maybeSingle();
    if (data) {
      setUsername(data.username || "");
      setDisplayName(data.display_name || "");
      setAvatarUrl(data.avatar_url || "");
      setBio(data.bio || "");
      setMessagesPrivacy(((data as any).messages_privacy as any) || "everyone");
    } else {
      await supabase.from("profiles").insert({ user_id: user.id, username: "" });
    }
    setLoading(false);
  };

  const fetchFollowCounts = async () => {
    if (!user) return;
    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);
    setFollowerCount(followers || 0);
    setFollowingCount(following || 0);
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
    saveTimer.current = setTimeout(() => autoSave(fields), 700);
  }, [autoSave]);

  const updatePrivacy = async (v: "everyone" | "followers") => {
    setMessagesPrivacy(v);
    await autoSave({ messages_privacy: v });
    toast({ title: t("settingsUpdated") });
  };

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
          <AvatarUpload currentUrl={avatarUrl} onUpload={(url) => { setAvatarUrl(url); autoSave({ avatar_url: url || null }); }} />
          {(displayName || username) && (
            <div className="flex items-center gap-1.5 mt-4">
              <h3 className="text-lg font-semibold">{displayName || username}</h3>
              {user && <UserBadge userId={user.id} />}
            </div>
          )}
          {username && <p className="text-sm text-primary/80 mt-0.5">@{username.replace(/^@/, "")}</p>}
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1"><Mail className="w-4 h-4" />{user?.email}</p>

          <div className="flex gap-6 mt-4 text-sm">
            <div className="text-center"><div className="font-bold text-lg">{followerCount}</div><div className="text-xs text-muted-foreground">{t("followers")}</div></div>
            <div className="text-center"><div className="font-bold text-lg">{followingCount}</div><div className="text-xs text-muted-foreground">{t("following")}</div></div>
          </div>
        </div>

        <div className="space-y-4">
          <FlameInput label={t("displayName")} placeholder={t("displayNamePlaceholder")} value={displayName} onChange={e => { setDisplayName(e.target.value); debouncedSave({ display_name: e.target.value }); }} disabled={loading} />
          <FlameInput label="@Username" placeholder="unique_handle" value={username} onChange={e => { setUsername(e.target.value); setUsernameError(""); debouncedSave({ username: e.target.value }); }} disabled={loading} error={usernameError} />
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground/80 mb-2">{t("aboutMe")}</label>
            <textarea className="w-full touch-target px-4 py-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 resize-none" placeholder={t("aboutMePlaceholder")} rows={3} value={bio} onChange={e => { setBio(e.target.value); debouncedSave({ bio: e.target.value }); }} disabled={loading} />
          </div>
        </div>
      </GlassCard>

      <button
        onClick={() => setSettingsOpen(true)}
        className="w-full group relative overflow-hidden rounded-xl p-[2px] bg-gradient-to-r from-[#a87cff] via-[#7f5af0] to-[#5b3fe0] shadow-[0_0_18px_rgba(127,90,240,0.45)] hover:shadow-[0_0_28px_rgba(127,90,240,0.65)] transition-all">
        <div className="flex items-center justify-between bg-background/90 hover:bg-background/80 rounded-[10px] px-5 py-4 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary group-hover:rotate-90 transition-transform duration-500" />
            </div>
            <div className="text-left">
              <p className="font-semibold">{t("settings")}</p>
              <p className="text-xs text-muted-foreground">{t("openSettings")}</p>
            </div>
          </div>
          <span className="text-primary text-xl">›</span>
        </div>
      </button>


      {isAdmin && (
        <FlameButton onClick={() => setShowAdmin(true)} className="w-full" variant="outline"><Shield className="w-4 h-4 mr-2" />{t("adminPanel")}</FlameButton>
      )}

      <FlameButton variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={signOut}>
        <LogOut className="w-4 h-4 mr-2" />{t("logout")}
      </FlameButton>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-background/95 backdrop-blur-xl border-l border-primary/20">
          <SheetHeader>
            <button onClick={() => setSettingsOpen(false)} className="flex items-center gap-2 text-sm text-primary hover:underline mb-2 self-start">
              <ArrowLeft className="w-4 h-4" /> {t("backToProfile")}
            </button>
            <SheetTitle className="flex items-center gap-2"><Settings className="w-5 h-5" />{t("settings")}</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 mt-6">
            <div className="py-2 border-b border-border/50">
              <p className="font-medium text-sm">{t("email")}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>

            <div className="py-2">
              <div className="flex items-center gap-2 mb-2"><Globe className="w-4 h-4 text-muted-foreground" /><p className="font-medium text-sm">{t("language")}</p></div>
              <select
                value={lang}
                onChange={e => setLang(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm">
                <option value="ru">{t("russian")}</option>
                <option value="en">{t("english")}</option>
              </select>
            </div>

            <div className="py-2">
              <div className="flex items-center gap-2 mb-2"><UsersIcon className="w-4 h-4 text-muted-foreground" /><p className="font-medium text-sm">{t("messagesPrivacy")}</p></div>
              <div className="flex gap-2">
                <button onClick={() => updatePrivacy("everyone")} className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${messagesPrivacy === "everyone" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>{t("privacyPublic")}</button>
                <button onClick={() => updatePrivacy("followers")} className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${messagesPrivacy === "followers" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>{t("privacyFriendsOnly")}</button>
              </div>
            </div>

            <div className="py-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-muted-foreground" /><p className="font-medium text-sm">{t("soundVolume")}</p></div>
                <span className="text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
              </div>
              <Slider
                value={[volume * 100]}
                min={0} max={100} step={1}
                onValueChange={(v) => { const nv = v[0] / 100; setVolumeState(nv); persistVolume(nv); }}
                onValueCommit={() => playNotificationSound()}
              />
            </div>

            <FlameButton variant="outline" className="w-full mt-6" onClick={() => setSettingsOpen(false)}>
              <ArrowLeft className="w-4 h-4 mr-2" />{t("backToProfile")}
            </FlameButton>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
