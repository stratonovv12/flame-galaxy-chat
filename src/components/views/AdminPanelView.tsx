import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Shield, BadgeCheck, Ban, UserX, Search } from "lucide-react";
import { FlameInput } from "@/components/ui/FlameInput";
import { toast } from "@/hooks/use-toast";

interface UserProfile {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
}

export function AdminPanelView() {
  const { user } = useAuth();
  const [bannedUsers, setBannedUsers] = useState<(UserProfile & { ban_id: string })[]>([]);
  const [verifiedUsers, setVerifiedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBannedUsers();
    fetchVerifiedUsers();
  }, []);

  const fetchBannedUsers = async () => {
    const { data: bans } = await supabase.from("banned_users").select("id, user_id");
    if (!bans || bans.length === 0) { setBannedUsers([]); return; }
    const userIds = bans.map(b => b.user_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", userIds);
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setBannedUsers(bans.map(b => ({
      ban_id: b.id,
      user_id: b.user_id,
      username: profileMap.get(b.user_id)?.username || null,
      avatar_url: profileMap.get(b.user_id)?.avatar_url || null,
    })));
  };

  const fetchVerifiedUsers = async () => {
    const { data } = await supabase.from("verified_users").select("user_id");
    setVerifiedUsers(new Set(data?.map(v => v.user_id) || []));
  };

  const escapePattern = (str: string) => str.replace(/[%_\\]/g, '\\$&');

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const q = escapePattern(searchQuery.trim().replace(/^@/, ""));
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .or(`username.ilike.%${q}%`)
      .limit(20);
    setSearchResults(data || []);
    setLoading(false);
  };

  const toggleBan = async (userId: string) => {
    if (!user) return;
    const { data: existing } = await supabase.from("banned_users").select("id").eq("user_id", userId).maybeSingle();
    if (existing) {
      await supabase.from("banned_users").delete().eq("id", existing.id);
      toast({ title: "Пользователь разбанен" });
    } else {
      await supabase.from("banned_users").insert({ user_id: userId, banned_by: user.id });
      toast({ title: "Пользователь забанен" });
    }
    fetchBannedUsers();
  };

  const toggleVerified = async (userId: string) => {
    if (!user) return;
    const { data: existing } = await supabase.from("verified_users").select("id").eq("user_id", userId).maybeSingle();
    if (existing) {
      await supabase.from("verified_users").delete().eq("id", existing.id);
      setVerifiedUsers(prev => { const n = new Set(prev); n.delete(userId); return n; });
      toast({ title: "Верификация снята" });
    } else {
      await supabase.from("verified_users").insert({ user_id: userId, verified_by: user.id });
      setVerifiedUsers(prev => new Set([...prev, userId]));
      toast({ title: "Пользователь верифицирован ✓" });
    }
  };

  const isBanned = (userId: string) => bannedUsers.some(b => b.user_id === userId);

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Shield className="w-6 h-6 text-primary" />
        Панель администратора
      </h2>

      {/* Search users */}
      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3">Поиск пользователей</h3>
        <div className="flex gap-2">
          <FlameInput
            placeholder="Имя или @handle..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && searchUsers()}
            className="flex-1"
          />
          <FlameButton onClick={searchUsers} disabled={loading}>
            <Search className="w-4 h-4" />
          </FlameButton>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map(u => (
              <div key={u.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                <UserAvatar username={u.username} avatarUrl={u.avatar_url} size="md" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{u.username || "Без имени"}</p>
                  <p className="text-xs text-muted-foreground">
                    {verifiedUsers.has(u.user_id) && "✅ Верифицирован "}
                    {isBanned(u.user_id) && "🚫 Забанен"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleVerified(u.user_id)}
                    className={`p-2 rounded-lg transition-colors ${verifiedUsers.has(u.user_id) ? "bg-blue-500/20 text-blue-400" : "hover:bg-muted/50 text-muted-foreground"}`}
                    title={verifiedUsers.has(u.user_id) ? "Снять верификацию" : "Верифицировать"}
                  >
                    <BadgeCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleBan(u.user_id)}
                    className={`p-2 rounded-lg transition-colors ${isBanned(u.user_id) ? "bg-destructive/20 text-destructive" : "hover:bg-muted/50 text-muted-foreground"}`}
                    title={isBanned(u.user_id) ? "Разбанить" : "Забанить"}
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Banned users list */}
      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <UserX className="w-5 h-5 text-destructive" />
          Забаненные ({bannedUsers.length})
        </h3>
        {bannedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет забаненных пользователей</p>
        ) : (
          <div className="space-y-2">
            {bannedUsers.map(bu => (
              <div key={bu.ban_id} className="flex items-center gap-3 p-2 rounded-lg bg-destructive/5">
                <UserAvatar username={bu.username} avatarUrl={bu.avatar_url} size="md" />
                <p className="flex-1 font-medium text-sm">{bu.username || "Без имени"}</p>
                <FlameButton variant="outline" size="sm" onClick={() => toggleBan(bu.user_id)} className="border-destructive/50 text-destructive hover:bg-destructive/10">
                  Разбанить
                </FlameButton>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
