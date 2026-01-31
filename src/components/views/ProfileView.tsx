import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LogOut, Save, Settings, Mail, Link } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ProfileView() {
  const { user, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setUsername(data.username || "");
      setAvatarUrl(data.avatar_url || "");
    } else if (!error) {
      // Create profile if doesn't exist
      await supabase.from("profiles").insert({
        user_id: user.id,
        username: "",
      });
    }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        username: username.trim(),
        avatar_url: avatarUrl.trim() || null,
      }, {
        onConflict: "user_id",
      });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить профиль",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Сохранено!",
        description: "Профиль успешно обновлён",
      });
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold">Профиль</h2>

      {/* Profile Card */}
      <GlassCard className="p-6" glow>
        <div className="flex flex-col items-center mb-6">
          <div className="mb-4">
            <UserAvatar
              username={username}
              avatarUrl={avatarUrl}
              size="xl"
              className="neon-glow"
            />
          </div>
          {username && (
            <h3 className="text-lg font-semibold">{username}</h3>
          )}
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Mail className="w-4 h-4" />
            {user?.email}
          </p>
        </div>

        <div className="space-y-4">
          <FlameInput
            label="Имя пользователя"
            placeholder="Введите имя..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Link className="w-4 h-4" />
              URL аватара (опционально)
            </label>
            <FlameInput
              placeholder="https://example.com/avatar.jpg"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Вставьте ссылку на изображение из интернета
            </p>
          </div>
          <FlameButton
            onClick={saveProfile}
            className="w-full"
            disabled={saving || loading}
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Сохранение..." : "Сохранить"}
          </FlameButton>
        </div>
      </GlassCard>

      {/* Settings */}
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
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString("ru-RU")
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Logout */}
      <FlameButton
        variant="outline"
        className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
        onClick={handleSignOut}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Выйти из аккаунта
      </FlameButton>
    </div>
  );
}
