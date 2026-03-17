import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Shield, BadgeCheck, Ban, UserX, Search, Hash, Users, Trash2 } from "lucide-react";
import { FlameInput } from "@/components/ui/FlameInput";
import { toast } from "@/hooks/use-toast";

interface UserProfile { user_id: string; username: string | null; avatar_url: string | null; }
interface ChannelItem { id: string; name: string; handle: string | null; avatar_url: string | null; creator_id: string; }
interface GroupItem { id: string; name: string; handle: string | null; avatar_url: string | null; creator_id: string; }

export function AdminPanelView() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [bannedUsers, setBannedUsers] = useState<(UserProfile & { ban_id: string })[]>([]);
  const [verifiedUsers, setVerifiedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [channelSearch, setChannelSearch] = useState("");
  const [channelResults, setChannelResults] = useState<ChannelItem[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupResults, setGroupResults] = useState<GroupItem[]>([]);
  const [verifiedChannels, setVerifiedChannels] = useState<Set<string>>(new Set());
  const [verifiedGroups, setVerifiedGroups] = useState<Set<string>>(new Set());

  useEffect(() => { fetchBannedUsers(); fetchVerifiedUsers(); fetchVerifiedChannels(); fetchVerifiedGroups(); }, []);

  const fetchBannedUsers = async () => {
    const { data: bans } = await supabase.from("banned_users").select("id, user_id");
    if (!bans || bans.length === 0) { setBannedUsers([]); return; }
    const userIds = bans.map(b => b.user_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", userIds);
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setBannedUsers(bans.map(b => ({ ban_id: b.id, user_id: b.user_id, username: profileMap.get(b.user_id)?.username || null, avatar_url: profileMap.get(b.user_id)?.avatar_url || null })));
  };

  const fetchVerifiedUsers = async () => { const { data } = await supabase.from("verified_users").select("user_id"); setVerifiedUsers(new Set(data?.map(v => v.user_id) || [])); };
  const fetchVerifiedChannels = async () => { const { data } = await supabase.from("verified_channels").select("channel_id"); setVerifiedChannels(new Set(data?.map(v => v.channel_id) || [])); };
  const fetchVerifiedGroups = async () => { const { data } = await supabase.from("verified_groups").select("group_id"); setVerifiedGroups(new Set(data?.map(v => v.group_id) || [])); };

  const escapePattern = (str: string) => str.replace(/[%_\\]/g, '\\$&');

  const searchUsersAction = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const q = escapePattern(searchQuery.trim().replace(/^@/, ""));
    const { data } = await supabase.from("profiles").select("user_id, username, avatar_url").or(`username.ilike.%${q}%`).limit(20);
    setSearchResults(data || []);
    setLoading(false);
  };

  const searchChannelsAction = async () => {
    if (!channelSearch.trim()) return;
    const q = escapePattern(channelSearch.trim().replace(/^@/, ""));
    const { data } = await supabase.from("channels").select("id, name, handle, avatar_url, creator_id").or(`name.ilike.%${q}%,handle.ilike.%${q}%`).limit(20);
    setChannelResults(data || []);
  };

  const searchGroupsAction = async () => {
    if (!groupSearch.trim()) return;
    const q = escapePattern(groupSearch.trim().replace(/^@/, ""));
    const { data } = await supabase.from("groups").select("id, name, handle, avatar_url, creator_id").or(`name.ilike.%${q}%,handle.ilike.%${q}%`).limit(20);
    setGroupResults(data || []);
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

  const toggleVerifiedChannel = async (channelId: string) => {
    if (!user) return;
    const { data: existing } = await supabase.from("verified_channels").select("id").eq("channel_id", channelId).maybeSingle();
    if (existing) { await supabase.from("verified_channels").delete().eq("id", existing.id); setVerifiedChannels(prev => { const n = new Set(prev); n.delete(channelId); return n; }); toast({ title: t("channelVerRemoved") }); }
    else { await supabase.from("verified_channels").insert({ channel_id: channelId, verified_by: user.id }); setVerifiedChannels(prev => new Set([...prev, channelId])); toast({ title: t("channelVerified") }); }
  };

  const toggleVerifiedGroup = async (groupId: string) => {
    if (!user) return;
    const { data: existing } = await supabase.from("verified_groups").select("id").eq("group_id", groupId).maybeSingle();
    if (existing) { await supabase.from("verified_groups").delete().eq("id", existing.id); setVerifiedGroups(prev => { const n = new Set(prev); n.delete(groupId); return n; }); toast({ title: t("groupVerRemoved") }); }
    else { await supabase.from("verified_groups").insert({ group_id: groupId, verified_by: user.id }); setVerifiedGroups(prev => new Set([...prev, groupId])); toast({ title: t("groupVerified") }); }
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm(t("deleteChannelConfirmAdmin"))) return;
    await supabase.from("channels").delete().eq("id", channelId);
    setChannelResults(prev => prev.filter(c => c.id !== channelId));
    toast({ title: t("channelDeleted") });
  };

  const deleteGroup = async (groupId: string) => {
    if (!confirm(t("deleteGroupConfirmAdmin"))) return;
    await supabase.from("groups").delete().eq("id", groupId);
    setGroupResults(prev => prev.filter(g => g.id !== groupId));
    toast({ title: t("groupDeleted") });
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
                  <button onClick={() => toggleVerified(u.user_id)} className={`p-2 rounded-lg transition-colors ${verifiedUsers.has(u.user_id) ? "bg-blue-500/20 text-blue-400" : "hover:bg-muted/50 text-muted-foreground"}`} title={verifiedUsers.has(u.user_id) ? t("removeVerification") : t("verify")}><BadgeCheck className="w-4 h-4" /></button>
                  <button onClick={() => toggleBan(u.user_id)} className={`p-2 rounded-lg transition-colors ${isBanned(u.user_id) ? "bg-destructive/20 text-destructive" : "hover:bg-muted/50 text-muted-foreground"}`} title={isBanned(u.user_id) ? t("unban") : t("ban")}><Ban className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Hash className="w-5 h-5 text-primary" />{t("manageChannels")}</h3>
        <div className="flex gap-2">
          <FlameInput placeholder={t("searchChannels")} value={channelSearch} onChange={e => setChannelSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchChannelsAction()} className="flex-1" />
          <FlameButton onClick={searchChannelsAction}><Search className="w-4 h-4" /></FlameButton>
        </div>
        {channelResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {channelResults.map(ch => (
              <div key={ch.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                {ch.avatar_url ? <img src={ch.avatar_url} alt={ch.name} className="w-10 h-10 rounded-xl object-cover" /> : <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center"><Hash className="w-5 h-5 text-primary" /></div>}
                <div className="flex-1">
                  <p className="font-medium text-sm">{ch.name}</p>
                  {ch.handle && <p className="text-xs text-primary/70">@{ch.handle}</p>}
                  {verifiedChannels.has(ch.id) && <p className="text-xs text-blue-400">✅ {t("verified")}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => toggleVerifiedChannel(ch.id)} className={`p-2 rounded-lg transition-colors ${verifiedChannels.has(ch.id) ? "bg-blue-500/20 text-blue-400" : "hover:bg-muted/50 text-muted-foreground"}`}><BadgeCheck className="w-4 h-4" /></button>
                  <button onClick={() => deleteChannel(ch.id)} className="p-2 rounded-lg transition-colors hover:bg-destructive/20 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="w-5 h-5 text-accent" />{t("manageGroups")}</h3>
        <div className="flex gap-2">
          <FlameInput placeholder={t("searchGroups")} value={groupSearch} onChange={e => setGroupSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchGroupsAction()} className="flex-1" />
          <FlameButton onClick={searchGroupsAction}><Search className="w-4 h-4" /></FlameButton>
        </div>
        {groupResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {groupResults.map(gr => (
              <div key={gr.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                {gr.avatar_url ? <img src={gr.avatar_url} alt={gr.name} className="w-10 h-10 rounded-xl object-cover" /> : <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center"><Users className="w-5 h-5 text-accent" /></div>}
                <div className="flex-1">
                  <p className="font-medium text-sm">{gr.name}</p>
                  {gr.handle && <p className="text-xs text-primary/70">@{gr.handle}</p>}
                  {verifiedGroups.has(gr.id) && <p className="text-xs text-blue-400">✅ {t("verified")}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => toggleVerifiedGroup(gr.id)} className={`p-2 rounded-lg transition-colors ${verifiedGroups.has(gr.id) ? "bg-blue-500/20 text-blue-400" : "hover:bg-muted/50 text-muted-foreground"}`}><BadgeCheck className="w-4 h-4" /></button>
                  <button onClick={() => deleteGroup(gr.id)} className="p-2 rounded-lg transition-colors hover:bg-destructive/20 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
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
    </div>
  );
}
