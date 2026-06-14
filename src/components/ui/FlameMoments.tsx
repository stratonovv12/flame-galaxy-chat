import { useEffect, useState, useRef, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { X, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface MomentItem {
  id: string;
  media_url: string;
  media_type: string;
  created_at: string;
}

interface UserMoments {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  items: MomentItem[]; // newest first
  lastAt: string;
}

const MAX_MB = 25;
const STORY_MS = 5000;

export function MomentsStoryViewer({
  group,
  onClose,
  ownerCanDelete,
  onDeleted,
}: {
  group: UserMoments;
  onClose: () => void;
  ownerCanDelete?: boolean;
  onDeleted?: (itemId: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const items = group.items;
  const active = items[idx];

  useEffect(() => {
    setProgress(0);
    if (!active) return;
    const start = Date.now();
    const t = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / STORY_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(t);
        setIdx((i) => (i + 1 < items.length ? i + 1 : -1));
      }
    }, 50);
    return () => clearInterval(t);
  }, [idx, items.length]);

  useEffect(() => { if (idx === -1) onClose(); }, [idx, onClose]);

  const next = () => setIdx((i) => (i + 1 < items.length ? i + 1 : -1));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  const initial = (n?: string | null) => (n?.replace(/^@/, "").charAt(0) || "?").toUpperCase();

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-fade-in select-none"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
      }}
    >
      {/* Progress bars */}
      <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
        {items.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-[width] duration-75 ease-linear"
              style={{ width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-7 left-3 right-3 flex items-center gap-2 z-20">
        <div className="w-9 h-9 rounded-full overflow-hidden border border-white/30 bg-muted flex items-center justify-center">
          {group.avatar_url
            ? <img src={group.avatar_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-sm font-bold text-white">{initial(group.display_name || group.username)}</span>}
        </div>
        <span className="text-white text-sm font-medium drop-shadow">{group.display_name || group.username || "—"}</span>
        <span className="text-white/60 text-xs">{new Date(active.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {ownerCanDelete && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              await supabase.from("flame_moments").delete().eq("id", active.id);
              onDeleted?.(active.id);
              if (items.length <= 1) onClose();
              else setIdx((i) => Math.min(i, items.length - 2));
            }}
            className="text-white/80 hover:text-destructive p-1 ml-auto"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button onClick={onClose} className={`text-white/90 hover:text-white p-1 ${ownerCanDelete ? "" : "ml-auto"}`}>
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Media */}
      {active.media_type === "video"
        ? <video key={active.id} src={active.media_url} autoPlay playsInline className="max-h-full max-w-full object-contain animate-scale-in" />
        : <img key={active.id} src={active.media_url} alt="" className="max-h-full max-w-full object-contain animate-scale-in" />}

      {/* Tap zones */}
      <button aria-label="prev" onClick={prev} className="absolute inset-y-0 left-0 w-1/3 z-10" />
      <button aria-label="next" onClick={next} className="absolute inset-y-0 right-0 w-1/3 z-10" />

      {/* Desktop arrows */}
      {idx > 0 && (
        <button onClick={prev} className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 rounded-full p-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}
      {idx < items.length - 1 && (
        <button onClick={next} className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 rounded-full p-2">
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}
    </div>
  );
}

export async function fetchUserMoments(userId: string): Promise<UserMoments | null> {
  const { data: rows } = await supabase.from("flame_moments")
    .select("id, user_id, media_url, media_type, created_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (!rows || rows.length === 0) return null;
  const { data: profile } = await supabase.from("profiles")
    .select("user_id, username, display_name, avatar_url").eq("user_id", userId).maybeSingle();
  return {
    user_id: userId,
    username: profile?.username || null,
    display_name: profile?.display_name || null,
    avatar_url: profile?.avatar_url || null,
    items: rows,
    lastAt: rows[0].created_at,
  };
}

export function FlameMoments() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [groups, setGroups] = useState<UserMoments[]>([]);
  const [activeGroupIdx, setActiveGroupIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchMoments = useCallback(async () => {
    const { data: rows } = await supabase.from("flame_moments")
      .select("id, user_id, media_url, media_type, created_at")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    if (!rows || rows.length === 0) { setGroups([]); return; }
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await supabase.from("profiles")
      .select("user_id, username, display_name, avatar_url").in("user_id", userIds);
    const pmap = new Map((profiles || []).map((p) => [p.user_id, p]));

    const grouped = new Map<string, UserMoments>();
    for (const r of rows) {
      const g = grouped.get(r.user_id);
      const item: MomentItem = { id: r.id, media_url: r.media_url, media_type: r.media_type, created_at: r.created_at };
      if (g) {
        g.items.push(item);
        if (r.created_at > g.lastAt) g.lastAt = r.created_at;
      } else {
        const p = pmap.get(r.user_id);
        grouped.set(r.user_id, {
          user_id: r.user_id,
          username: p?.username || null,
          display_name: p?.display_name || null,
          avatar_url: p?.avatar_url || null,
          items: [item],
          lastAt: r.created_at,
        });
      }
    }
    // Sort: current user first if present, then by most recent activity
    const arr = [...grouped.values()].sort((a, b) => {
      if (user) {
        if (a.user_id === user.id) return -1;
        if (b.user_id === user.id) return 1;
      }
      return b.lastAt.localeCompare(a.lastAt);
    });
    setGroups(arr);
  }, [user]);

  useEffect(() => {
    fetchMoments();
    const channel = supabase.channel("flame-moments-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "flame_moments" }, () => fetchMoments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMoments]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const isImg = file.type.startsWith("image/");
    const isVid = file.type.startsWith("video/");
    if (!isImg && !isVid) { toast({ title: t("error"), description: t("mediaTypeUnsupported"), variant: "destructive" }); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast({ title: t("error"), description: `Max ${MAX_MB}MB`, variant: "destructive" }); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/moments/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const { error: insErr } = await supabase.from("flame_moments").insert({
        user_id: user.id, media_url: pub.publicUrl, media_type: isImg ? "image" : "video",
      });
      if (insErr) throw insErr;
      toast({ title: t("momentPosted") });
      fetchMoments();
    } catch (err: any) {
      toast({ title: t("error"), description: err.message || "upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const initial = (name?: string | null) => (name?.replace(/^@/, "").charAt(0) || "?").toUpperCase();
  const activeGroup = activeGroupIdx !== null ? groups[activeGroupIdx] : null;

  return (
    <>
      <div className="px-1">
        <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar -mx-1 px-1">
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onFile} className="hidden" />
          <button
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-1 shrink-0 disabled:opacity-50"
          >
            <div className="w-16 h-16 rounded-full bg-muted/40 border-2 border-dashed border-primary/40 flex items-center justify-center">
              {uploading
                ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <Plus className="w-6 h-6 text-primary" />}
            </div>
            <span className="text-[10px] text-muted-foreground max-w-[64px] truncate">{t("yourMoment")}</span>
          </button>

          {groups.length === 0 && !uploading && (
            <span className="text-xs text-muted-foreground py-6">{t("noMomentsYet")}</span>
          )}

          {groups.map((g, i) => (
            <button key={g.user_id} onClick={() => setActiveGroupIdx(i)} className="flex flex-col items-center gap-1 shrink-0 group">
              <div className="relative p-[2px] rounded-full bg-gradient-to-br from-[#a87cff] via-[#7f5af0] to-[#5b3fe0] shadow-[0_0_14px_rgba(127,90,240,0.55)]">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-background bg-muted flex items-center justify-center">
                  {g.avatar_url
                    ? <img src={g.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-sm font-bold">{initial(g.display_name || g.username)}</span>}
                </div>
                {g.items.length > 1 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                    {g.items.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] max-w-[64px] truncate">
                {g.user_id === user?.id ? t("yourMoment") : (g.display_name || g.username || "—")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeGroup && (
        <MomentsStoryViewer
          group={activeGroup}
          onClose={() => setActiveGroupIdx(null)}
          ownerCanDelete={user?.id === activeGroup.user_id}
          onDeleted={() => fetchMoments()}
        />
      )}
    </>
  );
}
