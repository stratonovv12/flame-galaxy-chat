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
import { LogOut, Settings, Mail, Shield, Globe, Users as UsersIcon, ArrowLeft, Volume2, Boxes, User, Palette, Bell, SlidersHorizontal } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { getVolume, setVolume as persistVolume, playNotificationSound } from "@/lib/notifications";
import { MiniAppsView } from "@/components/views/MiniAppsView";
import { FollowListModal } from "@/components/ui/FollowListModal";
import { ProfileItems } from "@/components/ui/ProfileItems";
import { FigurineShowcase } from "@/components/views/FigurinesView";
import { PhoneSettings } from "@/components/ui/PhoneSettings";
import { AccountSwitcher } from "@/components/ui/AccountSwitcher";
import flameLogo from "@/assets/flame-logo.png";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

interface ProfileViewProps {
  onNavigate?: (tab: string) => void;
  settingsInitiallyOpen?: boolean;
}

type SettingsTab = "account" | "appearance" | "privacy" | "general";

export function ProfileView({ onNavigate, settingsInitiallyOpen = false }: ProfileViewProps) {
  const { user, signOut, isAdmin } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { theme, setTheme } = useTheme();
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
  const [settingsOpen, setSettingsOpen] = useState(settingsInitiallyOpen);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [volume, setVolumeState] = useState(() => getVolume());
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<null | "followers" | "following">(null);
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

  const TABS: { key: SettingsTab; label: string; icon: typeof User }[] = [
    { key: "account", label: t("tabAccount"), icon: User },
    { key: "appearance", label: t("tabAppearance"), icon: Palette },
    { key: "privacy", label: t("tabPrivacy"), icon: Bell },
    { key: "general", label: t("tabGeneral"), icon: SlidersHorizontal },
  ];

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t("profile")}</h2>
        <button onClick={() => { setSettingsTab("account"); setSettingsOpen(true); }}
          className="p-2 rounded-lg hover:bg-primary/10 text-primary" aria-label={t("settings")}>
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Minimalist identity card */}
      <GlassCard className="p-6" glow>
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/40 bg-muted/30 flex items-center justify-center">
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              : <User className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <h3 className="text-lg font-semibold">{displayName || username || t("profile")}</h3>
            {user && <UserBadge userId={user.id} />}
          </div>
          {username && <p className="text-sm text-primary/80 mt-0.5">@{username.replace(/^@/, "")}</p>}

          <div className="flex gap-8 mt-4 text-sm">
            <button onClick={() => setFollowListOpen("followers")} className="text-center hover:text-primary transition-colors">
              <div className="font-bold text-lg">{followerCount}</div>
              <div className="text-xs text-muted-foreground">{t("followers")}</div>
            </button>
            <button onClick={() => setFollowListOpen("following")} className="text-center hover:text-primary transition-colors">
              <div className="font-bold text-lg">{followingCount}</div>
              <div className="text-xs text-muted-foreground">{t("following")}</div>
            </button>
          </div>
        </div>
      </GlassCard>

      {isAdmin && (
        <FlameButton onClick={() => setShowAdmin(true)} className="w-full" variant="outline">
          <Shield className="w-4 h-4 mr-2" />{t("adminPanel")}
        </FlameButton>
      )}

      {/* Create Post in Profile + published posts */}
      {user && <ProfileItems userId={user.id} editable />}

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-background/95 backdrop-blur-xl border-l border-primary/20">
          <SheetHeader>
            <button onClick={() => setSettingsOpen(false)} className="flex items-center gap-2 text-sm text-primary hover:underline mb-2 self-start">
              <ArrowLeft className="w-4 h-4" /> {t("backToProfile")}
            </button>
            <SheetTitle className="flex items-center gap-2"><Settings className="w-5 h-5" />{t("settings")}</SheetTitle>
          </SheetHeader>

          {/* Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 mt-4 rounded-xl bg-muted/30 border border-border">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setSettingsTab(key)}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${settingsTab === key ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(127,90,240,0.4)]" : "text-muted-foreground hover:bg-muted/50"}`}>
                <Icon className="w-4 h-4" />
                <span className="leading-tight text-center">{label.split(" ")[0]}</span>
              </button>
            ))}
          </div>

          <div className="space-y-5 mt-5">
            {settingsTab === "account" && (
              <>
                <div className="flex flex-col items-center">
                  <AvatarUpload currentUrl={avatarUrl} onUpload={(url) => { setAvatarUrl(url); autoSave({ avatar_url: url || null }); }} />
                </div>
                <FlameInput label={t("displayName")} placeholder={t("displayNamePlaceholder")} value={displayName} onChange={e => { setDisplayName(e.target.value); debouncedSave({ display_name: e.target.value }); }} disabled={loading} />
                <FlameInput label="@Username" placeholder="unique_handle" value={username} onChange={e => { setUsername(e.target.value); setUsernameError(""); debouncedSave({ username: e.target.value }); }} disabled={loading} error={usernameError} />
                <div className="w-full">
                  <label className="block text-sm font-medium text-foreground/80 mb-2">{t("aboutMe")}</label>
                  <textarea className="w-full touch-target px-4 py-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 resize-none" placeholder={t("aboutMePlaceholder")} rows={3} value={bio} onChange={e => { setBio(e.target.value); debouncedSave({ bio: e.target.value }); }} disabled={loading} />
                </div>

                <div className="py-2 border-t border-border/50">
                  <p className="font-medium text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />{t("email")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
                </div>

                <div className="py-2 border-t border-border/50">
                  <AccountSwitcher />
                </div>

                {user && (
                  <div className="py-2 border-t border-border/50">
                    <p className="font-medium text-sm mb-2">{t("myCollection")}</p>
                    <FigurineShowcase userId={user.id} />
                  </div>
                )}
              </>
            )}

            {settingsTab === "appearance" && (
              <div className="py-2 space-y-4">
                <div>
                  <p className="font-medium text-sm mb-2">{t("theme")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant={theme === "dark" ? "default" : "outline"} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>{t("themeDark")}</Button>
                    <Button variant={theme === "light" ? "default" : "outline"} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>{t("themeLight")}</Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2"><Globe className="w-4 h-4 text-muted-foreground" /><p className="font-medium text-sm">{t("language")}</p></div>
                <select
                  value={lang}
                  onChange={e => setLang(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm">
                  <option value="ru">{t("russian")}</option>
                  <option value="en">{t("english")}</option>
                </select>
              </div>
            )}

            {settingsTab === "privacy" && (
              <>
                <div className="py-2">
                  <div className="flex items-center gap-2 mb-2"><UsersIcon className="w-4 h-4 text-muted-foreground" /><p className="font-medium text-sm">{t("messagesPrivacy")}</p></div>
                  <div className="flex gap-2">
                    <button onClick={() => updatePrivacy("everyone")} className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${messagesPrivacy === "everyone" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>{t("privacyPublic")}</button>
                    <button onClick={() => updatePrivacy("followers")} className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${messagesPrivacy === "followers" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>{t("privacyFriendsOnly")}</button>
                  </div>
                </div>

                <div className="py-2 border-t border-border/50">
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

                <div className="py-2 border-t border-border/50">
                  <PhoneSettings />
                </div>
              </>
            )}

            {settingsTab === "general" && (
              <>
                <button
                  onClick={() => { setSettingsOpen(false); setWorkshopOpen(true); }}
                  className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border transition-colors">
                  <div className="flex items-center gap-2">
                    <img src={flameLogo} alt="" width={20} height={20} loading="lazy" className="w-5 h-5" />
                    <p className="font-medium text-sm">{t("miniAppWorkshop")}</p>
                  </div>
                  <span className="text-primary text-lg">›</span>
                </button>

                {isAdmin && (
                  <FlameButton onClick={() => { setSettingsOpen(false); setShowAdmin(true); }} className="w-full" variant="outline">
                    <Shield className="w-4 h-4 mr-2" />{t("adminPanel")}
                  </FlameButton>
                )}

                <FlameButton variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={signOut}>
                  <LogOut className="w-4 h-4 mr-2" />{t("logout")}
                </FlameButton>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <MiniAppsView open={workshopOpen} onOpenChange={setWorkshopOpen} />
      {user && followListOpen && (
        <FollowListModal
          open={!!followListOpen}
          onOpenChange={(o) => { if (!o) setFollowListOpen(null); }}
          userId={user.id}
          mode={followListOpen}
        />
      )}
    </div>
  );
}
