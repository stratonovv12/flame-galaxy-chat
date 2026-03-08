import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { AdminPanelView } from "@/components/views/AdminPanelView";
import { LogOut, Settings, Mail, Shield, Wallet, Package, ArrowLeftRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ProfileViewProps {
  onNavigate?: (tab: string) => void;
}

export function ProfileView({ onNavigate }: ProfileViewProps) {
  const { user, signOut, isAdmin } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [steamTradeUrl, setSteamTradeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { if (user) fetchProfile(); }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("username, display_name, avatar_url, bio, steam_trade_url").eq("user_id", user.id).maybeSingle();
    if (data) {
      setUsername(data.username || "");
      setDisplayName(data.display_name || "");
      setAvatarUrl(data.avatar_url || "");
      setBio(data.bio || "");
      setSteamTradeUrl(data.steam_trade_url || "");
    } else if (!error) {
      await supabase.from("profiles").insert({ user_id: user.id, username: "" });
    }
    setLoading(false);
  };

  const autoSave = useCallback(async (fields: { username?: string; display_name?: string; bio?: string; avatar_url?: string; steam_trade_url?: string }) => {
    if (!user) return;
    if (fields.username !== undefined) {
      const cleanName = fields.username.replace(/^@/, "").trim();
      if (cleanName) {
        const { data: existing } = await supabase.from("profiles").select("user_id").eq("username", cleanName).neq("user_id", user.id).maybeSingle();
        if (existing) { setUsernameError("Этот @username уже занят"); return; }
      }
      setUsernameError("");
      fields.username = cleanName;
    }
    const { error } = await supabase.from("profiles").update({ ...fields, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
  }, [user]);

  const debouncedSave = useCallback((fields: { username?: string; display_name?: string; bio?: string; avatar_url?: string; steam_trade_url?: string }) => {
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
        <div className="p-4">
          <button onClick={() => setShowAdmin(false)} className="text-sm text-primary hover:underline">← Назад к профилю</button>
        </div>
        <AdminPanelView />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold">Профиль</h2>

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
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Mail className="w-4 h-4" />{user?.email}
          </p>
        </div>

        <div className="space-y-4">
          <FlameInput label="Отображаемое имя" placeholder="Как вас зовут?" value={displayName} onChange={e => handleDisplayNameChange(e.target.value)} disabled={loading} />
          <FlameInput label="@Username (уникальный)" placeholder="unique_handle" value={username} onChange={e => handleUsernameChange(e.target.value)} disabled={loading} error={usernameError} />
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground/80 mb-2">О себе</label>
            <textarea className="w-full touch-target px-4 py-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 resize-none" placeholder="Расскажите о себе..." rows={3} value={bio} onChange={e => handleBioChange(e.target.value)} disabled={loading} />
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Settings className="w-5 h-5" />Настройки</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div><p className="font-medium">Email</p><p className="text-sm text-muted-foreground">{user?.email}</p></div>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div><p className="font-medium">Аккаунт создан</p><p className="text-sm text-muted-foreground">{user?.created_at ? new Date(user.created_at).toLocaleDateString("ru-RU") : "—"}</p></div>
          </div>
        </div>
      </GlassCard>

      {onNavigate && (
        <div className="grid grid-cols-3 gap-3">
          <FlameButton variant="outline" className="w-full" onClick={() => onNavigate("wallet")}>
            <Wallet className="w-4 h-4 mr-2" /> Кошелёк
          </FlameButton>
          <FlameButton variant="outline" className="w-full" onClick={() => onNavigate("inventory")}>
            <Package className="w-4 h-4 mr-2" /> Инвентарь
          </FlameButton>
          <FlameButton variant="outline" className="w-full" onClick={() => onNavigate("trades")}>
            <ArrowLeftRight className="w-4 h-4 mr-2" /> Трейды
          </FlameButton>
        </div>
      )}

      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">🎮 Steam интеграция</h3>
        <FlameInput
          label="Steam Trade URL"
          placeholder="https://steamcommunity.com/tradeoffer/new/?..."
          value={steamTradeUrl}
          onChange={e => handleSteamUrlChange(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground mt-2">Необходим для покупки/продажи на маркетплейсе</p>
      </GlassCard>

      {isAdmin && (
        <FlameButton onClick={() => setShowAdmin(true)} className="w-full" variant="outline">
          <Shield className="w-4 h-4 mr-2" />
          Панель администратора
        </FlameButton>
      )}

      <FlameButton variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={signOut}>
        <LogOut className="w-4 h-4 mr-2" />Выйти из аккаунта
      </FlameButton>
    </div>
  );
}
