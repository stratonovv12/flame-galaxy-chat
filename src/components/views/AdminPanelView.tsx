import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Shield, BadgeCheck, Ban, UserX, Search, Boxes, Trash2, Play, Pause } from "lucide-react";
import { FlameInput } from "@/components/ui/FlameInput";
import { toast } from "@/hooks/use-toast";

interface UserProfile { user_id: string; username: string | null; avatar_url: string | null; }

export function AdminPanelView() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [bannedUsers, setBannedUsers] = useState<(UserProfile & { ban_id: string })[]>([]);
  const [verifiedUsers, setVerifiedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  // Mini-app moderation
  const [appQuery, setAppQuery] = useState("");
  const [appResults, setAppResults] = useState<Array<{ id: string; handle: string; name: string; suspended: boolean; creator_id: string }>>([]);
  const [appLoading, setAppLoading] = useState(false);

  useEffect(() => { fetchBannedUsers(); fetchVerifiedUsers(); }, []);

  const searchMiniApps = async () => {
    setAppLoading(true);
    const q = appQuery.trim().replace(/^@/, "").replace(/[%_\\]/g, '\\$&');
    let query = supabase.from("mini_apps").select("id, handle, name, suspended, creator_id").order("created_at", { ascending: false }).limit(30);
    if (q) query = query.or(`handle.ilike.%${q}%,name.ilike.%${q}%`);
    const { data } = await query;
    setAppResults((data as any) || []);
    setAppLoading(false);
  };

  const toggleSuspend = async (id: string, suspended: boolean) => {
    const { error } = await supabase.from("mini_apps").update({ suspended: !suspended }).eq("id", id);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: !suspended ? "Mini-app suspended" : "Mini-app unsuspended" });
    searchMiniApps();
  };

  const deleteMiniApp = async (id: string) => {
    if (!confirm("Delete this mini-app permanently?")) return;
    const { error } = await supabase.from("mini_apps").delete().eq("id", id);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: "Mini-app deleted" });
    searchMiniApps();
  };

  const fetchBannedUsers = async () => {
    const { data: bans } = await supabase.from("banned_users").select("id, user_id");
    if (!bans || bans.length === 0) { setBannedUsers([]); return; }
    const userIds = bans.map(b => b.user_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", userIds);
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setBannedUsers(bans.map(b => ({ ban_id: b.id, user_id: b.user_id, username: profileMap.get(b.user_id)?.username || null, avatar_url: profileMap.get(b.user_id)?.avatar_url || null })));
  };

  const fetchVerifiedUsers = async () => {
    const { data } = await supabase.from("verified_users").select("user_id");
    setVerifiedUsers(new Set(data?.map(v => v.user_id) || []));
  };

  const escapePattern = (str: string) => str.replace(/[%_\\]/g, '\\$&');

  const searchUsersAction = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const q = escapePattern(searchQuery.trim().replace(/^@/, ""));
    const { data } = await supabase.from("profiles").select("user_id, username, avatar_url").or(`username.ilike.%${q}%`).limit(20);
    setSearchResults(data || []);
    setLoading(false);
  };

  const toggleBan = async (userId: string) => {
    if (!user) return;
    const { data: existing } = await supabase.from("banned_users").select("id").eq("user_id", userId).maybeSingle();
    if (existing) { await supabase.from("banned_users").delete().eq("id", existing.id); toast({ title: t("userUnbanned") }); }
    else { await supabase.from("banned_users").insert({ user_id: userId, banned_by: user.id }); toast({ title: t("userBanned") }); }
    fetchBannedUsers();
  };

  const toggleVerified = async (userId: string) => {
    if (!user) return;
    const { data: existing } = await supabase.from("verified_users").select("id").eq("user_id", userId).maybeSingle();
    if (existing) { await supabase.from("verified_users").delete().eq("id", existing.id); setVerifiedUsers(prev => { const n = new Set(prev); n.delete(userId); return n; }); toast({ title: t("verificationRemoved") }); }
    else { await supabase.from("verified_users").insert({ user_id: userId, verified_by: user.id }); setVerifiedUsers(prev => new Set([...prev, userId])); toast({ title: t("userVerified") }); }
  };

  const isBanned = (userId: string) => bannedUsers.some(b => b.user_id === userId);

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-primary" /> {t("adminPanelTitle")}</h2>

      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3">{t("searchUsers")}</h3>
        <div className="flex gap-2">
          <FlameInput placeholder={t("nameOrHandle")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchUsersAction()} className="flex-1" />
          <FlameButton onClick={searchUsersAction} disabled={loading}><Search className="w-4 h-4" /></FlameButton>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map(u => (
              <div key={u.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                <UserAvatar username={u.username} avatarUrl={u.avatar_url} size="md" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{u.username || t("noName")}</p>
                  <p className="text-xs text-muted-foreground">
                    {verifiedUsers.has(u.user_id) && `✅ ${t("verified")} `}
                    {isBanned(u.user_id) && `🚫 ${t("banned")}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => toggleVerified(u.user_id)} className={`p-2 rounded-lg ${verifiedUsers.has(u.user_id) ? "bg-blue-500/20 text-blue-400" : "hover:bg-muted/50 text-muted-foreground"}`}><BadgeCheck className="w-4 h-4" /></button>
                  <button onClick={() => toggleBan(u.user_id)} className={`p-2 rounded-lg ${isBanned(u.user_id) ? "bg-destructive/20 text-destructive" : "hover:bg-muted/50 text-muted-foreground"}`}><Ban className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><UserX className="w-5 h-5 text-destructive" /> {t("bannedList")} ({bannedUsers.length})</h3>
        {bannedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBannedUsers")}</p>
        ) : (
          <div className="space-y-2">
            {bannedUsers.map(bu => (
              <div key={bu.ban_id} className="flex items-center gap-3 p-2 rounded-lg bg-destructive/5">
                <UserAvatar username={bu.username} avatarUrl={bu.avatar_url} size="md" />
                <p className="flex-1 font-medium text-sm">{bu.username || t("noName")}</p>
                <FlameButton variant="outline" size="sm" onClick={() => toggleBan(bu.user_id)} className="border-destructive/50 text-destructive hover:bg-destructive/10">{t("unban")}</FlameButton>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Boxes className="w-5 h-5 text-primary" /> Mini-app moderation</h3>
        <div className="flex gap-2">
          <FlameInput placeholder="Search by @handle or name" value={appQuery} onChange={e => setAppQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchMiniApps()} className="flex-1" />
          <FlameButton onClick={searchMiniApps} disabled={appLoading}><Search className="w-4 h-4" /></FlameButton>
        </div>
        {appResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {appResults.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <Boxes className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">@{a.handle}{a.suspended ? " · 🚫 suspended" : ""}</p>
                </div>
                <button onClick={() => toggleSuspend(a.id, a.suspended)} className={`p-2 rounded-lg ${a.suspended ? "bg-primary/20 text-primary" : "hover:bg-destructive/20 text-destructive"}`} title={a.suspended ? "Unsuspend" : "Suspend"}>
                  {a.suspended ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button onClick={() => deleteMiniApp(a.id)} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

