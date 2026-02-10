import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { LogOut, Settings, Mail, AtSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ProfileView() {
  const { user, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("username, avatar_url, bio")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setUsername(data.username || "");
      setAvatarUrl(data.avatar_url || "");
      setBio(data.bio || "");
    } else if (!error) {
      await supabase.from("profiles").insert({ user_id: user.id, username: "" });
    }
    setLoading(false);
  };

  const autoSave = useCallback(async (fields: { username?: string; bio?: string; avatar_url?: string }) => {
    if (!user) return;

    // Check username uniqueness if changed
    if (fields.username !== undefined) {
      const cleanName = fields.username.replace(/^@/, "").trim();
      if (cleanName) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("username", cleanName)
          .neq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          setUsernameError("Это имя уже занято");
          return;
        }
      }
      setUsernameError("");
      fields.username = cleanName;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
    }
  }, [user]);

  const debouncedSave = useCallback((fields: { username?: string; bio?: string; avatar_url?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(fields), 800);
  }, [autoSave]);

  const handleUsernameChange = (val: string) => {
    setUsername(val);
    setUsernameError("");
    debouncedSave({ username: val });
  };

  const handleBioChange = (val: string) => {
    setBio(val);
    debouncedSave({ bio: val });
  };

  const handleAvatarUpload = (url: string) => {
    setAvatarUrl(url);
    autoSave({ avatar_url: url || null });
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold">Профиль</h2>

      <GlassCard className="p-6" glow>
        <div className="flex flex-col items-center mb-6">
          <AvatarUpload currentUrl={avatarUrl} onUpload={handleAvatarUpload} />
          {username && (
            <div className="flex items-center gap-1.5 mt-4">
              <h3 className="text-lg font-semibold">{username}</h3>
              {user && <UserBadge userId={user.id} />}
            </div>
          )}
          {username && (
            <p className="text-sm text-primary/80 mt-0.5">@{username.replace(/^@/, "")}</p>
          )}
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Mail className="w-4 h-4" />
            {user?.email}
          </p>
        </div>

        <div className="space-y-4">
          <FlameInput
            label="Имя пользователя (@handle)"
            placeholder="Введите уникальное имя..."
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            disabled={loading}
            error={usernameError}
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-foreground/80 mb-2">О себе</label>
            <textarea
              className="w-full touch-target px-4 py-3 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 resize-none"
              placeholder="Расскажите о себе..."
              rows={3}
              value={bio}
              onChange={(e) => handleBioChange(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Настройки
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div>
              <p className="font-medium">Аккаунт создан</p>
              <p className="text-sm text-muted-foreground">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString("ru-RU") : "—"}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <FlameButton
        variant="outline"
        className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
        onClick={signOut}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Выйти из аккаунта
      </FlameButton>
    </div>
  );
}
