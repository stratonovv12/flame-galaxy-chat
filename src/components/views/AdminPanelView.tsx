import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Shield, BadgeCheck, Ban, UserX, Search, Boxes, Trash2, Play, Pause, Gem, ImagePlus, Loader2 } from "lucide-react";
import { FlameInput } from "@/components/ui/FlameInput";
import { toast } from "@/hooks/use-toast";
import { uploadToMedia } from "@/lib/uploads";


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
  const [appResults, setAppResults] = useState<Array<{ id: string; handle: string; name: string; suspended: boolean; verified: boolean; creator_id: string }>>([]);
  const [appLoading, setAppLoading] = useState(false);

  // Token minting (admin only)
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([]);
  const [colName, setColName] = useState("");
  const [colDesc, setColDesc] = useState("");
  const [colBusy, setColBusy] = useState(false);
  const [figCollection, setFigCollection] = useState("");
  const [figName, setFigName] = useState("");
  const [figDesc, setFigDesc] = useState("");
  const [figRarity, setFigRarity] = useState("common");
  const [figSupply, setFigSupply] = useState("10");
  const [figPrice, setFigPrice] = useState("100");
  const [figImage, setFigImage] = useState("");
  const [figBusy, setFigBusy] = useState(false);
  const figFile = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchBannedUsers(); fetchVerifiedUsers(); loadCollections(); }, []);

  const loadCollections = async () => {
    const { data } = await supabase.from("token_collections").select("id, name").order("created_at", { ascending: false });
    setCollections(data || []);
    if (data?.length && !figCollection) setFigCollection(data[0].id);
  };

  const createCollection = async () => {
    if (!user || !colName.trim()) return;
    setColBusy(true);
    const { data, error } = await supabase.from("token_collections")
      .insert({ name: colName.trim(), description: colDesc.trim() || null, created_by: user.id })
      .select("id, name").single();
    setColBusy(false);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("createCollection"), description: data.name });
    setColName(""); setColDesc("");
    setCollections(prev => [data, ...prev]);
    setFigCollection(data.id);
  };


  const searchMiniApps = async () => {
    setAppLoading(true);
    const q = appQuery.trim().replace(/^@/, "").replace(/[%_\\]/g, '\\$&');
    let query = supabase.from("mini_apps").select("id, handle, name, suspended, verified, creator_id").order("created_at", { ascending: false }).limit(30);
    if (q) query = query.or(`handle.ilike.%${q}%,name.ilike.%${q}%`);
    const { data } = await query;
    setAppResults((data as any) || []);
    setAppLoading(false);
  };

  const toggleAppVerified = async (id: string, verified: boolean) => {
    const { error } = await supabase.from("mini_apps").update({ verified: !verified }).eq("id", id);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: !verified ? t("grantVerifiedBadge") : t("verificationRemoved") });
    setAppResults(prev => prev.map(a => (a.id === id ? { ...a, verified: !verified } : a)));
  };

  const uploadFigImage = async (file?: File) => {
    if (!file || !user) return;
    setFigBusy(true);
    try { setFigImage(await uploadToMedia(file, user.id, "figurines")); }
    catch (e: any) { toast({ title: t("error"), description: e.message, variant: "destructive" }); }
    setFigBusy(false);
  };

  const mintFigurine = async () => {
    if (!user || !figName.trim()) return;
    setFigBusy(true);
    const { error } = await supabase.from("figurines").insert({
      name: figName.trim(),
      description: figDesc.trim() || null,
      image_url: figImage || null,
      rarity: figRarity,
      supply: parseInt(figSupply) || 1,
      price: parseFloat(figPrice) || 0,
      created_by: user.id,
    });
    setFigBusy(false);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("mintFigurine"), description: figName });
    setFigName(""); setFigDesc(""); setFigImage("");
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
                  <p className="font-medium text-sm truncate flex items-center gap-1">
                    {a.name}
                    {a.verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">@{a.handle}{a.suspended ? " · 🚫 suspended" : ""}</p>
                </div>
                <button onClick={() => toggleAppVerified(a.id, a.verified)} className={`p-2 rounded-lg ${a.verified ? "bg-blue-500/20 text-blue-400" : "hover:bg-muted/50 text-muted-foreground"}`} title={t("grantVerifiedBadge")}>
                  <BadgeCheck className="w-4 h-4" />
                </button>
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

      <GlassCard className="p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Gem className="w-5 h-5 text-primary" /> {t("mintFigurine")}</h3>
        <FlameInput placeholder="Name" value={figName} onChange={e => setFigName(e.target.value)} />
        <FlameInput placeholder="Description" value={figDesc} onChange={e => setFigDesc(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <select value={figRarity} onChange={e => setFigRarity(e.target.value)}
            className="px-3 py-2 rounded-lg bg-input border border-border text-sm">
            {["common", "rare", "epic", "legendary"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <FlameInput placeholder="Supply" type="number" value={figSupply} onChange={e => setFigSupply(e.target.value)} />
          <FlameInput placeholder="Price (FLM)" type="number" value={figPrice} onChange={e => setFigPrice(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/15 border border-primary/30 overflow-hidden flex items-center justify-center shrink-0">
            {figImage ? <img src={figImage} alt="" className="w-full h-full object-cover" /> : <Gem className="w-5 h-5 text-primary" />}
          </div>
          <button onClick={() => figFile.current?.click()} disabled={figBusy}
            className="p-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary">
            {figBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          </button>
          <input ref={figFile} type="file" accept="image/*" className="hidden"
            onChange={e => { uploadFigImage(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        </div>
        <FlameButton onClick={mintFigurine} disabled={figBusy || !figName.trim()} className="w-full">
          <Gem className="w-4 h-4 mr-2" />{t("mintFigurine")}
        </FlameButton>
      </GlassCard>
    </div>

  );
}

