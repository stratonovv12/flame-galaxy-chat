import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { X, Plus, Trash2 } from "lucide-react";

interface MomentRow {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const MAX_MB = 25;

export function FlameMoments() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [moments, setMoments] = useState<MomentRow[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMoments();
    const channel = supabase.channel("flame-moments-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "flame_moments" }, () => fetchMoments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchMoments = async () => {
    const { data: rows } = await supabase.from("flame_moments")
      .select("id, user_id, media_url, media_type, created_at")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (!rows || rows.length === 0) { setMoments([]); return; }
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const { data: profiles } = await supabase.from("profiles")
      .select("user_id, username, display_name, avatar_url").in("user_id", userIds);
    const pmap = new Map((profiles || []).map(p => [p.user_id, p]));
    setMoments(rows.map(r => {
      const p = pmap.get(r.user_id);
      return {
        ...r,
        username: p?.username || null,
        display_name: p?.display_name || null,
        avatar_url: p?.avatar_url || null,
      };
    }));
  };

  useEffect(() => {
    if (activeIdx === null) return;
    setProgress(0);
    const start = Date.now();
    const interval = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / 5000) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setActiveIdx(i => (i !== null && i + 1 < moments.length ? i + 1 : null));
      }
    }, 50);
    return () => clearInterval(interval);
  }, [activeIdx, moments.length]);

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

  const deleteMoment = async (id: string) => {
    await supabase.from("flame_moments").delete().eq("id", id);
    setActiveIdx(null);
    fetchMoments();
  };

  const active = activeIdx !== null ? moments[activeIdx] : null;
  const initial = (name?: string | null) => (name?.replace(/^@/, "").charAt(0) || "?").toUpperCase();

  return (
    <>
      <div className="px-1">
        <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar -mx-1 px-1">
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onFile} className="hidden" />
          <button
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-1 shrink-0 disabled:opacity-50">
            <div className="w-16 h-16 rounded-full bg-muted/40 border-2 border-dashed border-primary/40 flex items-center justify-center">
              {uploading
                ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <Plus className="w-6 h-6 text-primary" />}
            </div>
            <span className="text-[10px] text-muted-foreground max-w-[64px] truncate">{t("yourMoment")}</span>
          </button>

          {moments.length === 0 && !uploading && (
            <span className="text-xs text-muted-foreground py-6">{t("noMomentsYet")}</span>
          )}

          {moments.map((m, i) => (
            <button key={m.id} onClick={() => setActiveIdx(i)} className="flex flex-col items-center gap-1 shrink-0 group">
              <div className="p-[2px] rounded-full bg-gradient-to-br from-[#a87cff] via-[#7f5af0] to-[#5b3fe0] shadow-[0_0_14px_rgba(127,90,240,0.55)]">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-background bg-muted flex items-center justify-center">
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-sm font-bold">{initial(m.display_name || m.username)}</span>}
                </div>
              </div>
              <span className="text-[10px] max-w-[64px] truncate">{m.display_name || m.username || "—"}</span>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-fade-in" onClick={() => setActiveIdx(null)}>
          <div className="absolute top-3 left-3 right-3 h-[3px] bg-white/15 rounded-full overflow-hidden z-10">
            <div className="h-full bg-white transition-[width] duration-75 ease-linear" style={{ width: `${progress}%` }} />
          </div>
          <div className="absolute top-7 left-3 right-3 flex items-center gap-2 z-10">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/30 bg-muted flex items-center justify-center">
              {active.avatar_url
                ? <img src={active.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-sm font-bold text-white">{initial(active.display_name || active.username)}</span>}
            </div>
            <span className="text-white text-sm font-medium drop-shadow">{active.display_name || active.username || "—"}</span>
            {user?.id === active.user_id && (
              <button onClick={(e) => { e.stopPropagation(); deleteMoment(active.id); }} className="text-white/80 hover:text-destructive p-1 ml-auto">
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setActiveIdx(null); }} className={`text-white/90 hover:text-white p-1 ${user?.id === active.user_id ? "" : "ml-auto"}`}>
              <X className="w-6 h-6" />
            </button>
          </div>
          {active.media_type === "video"
            ? <video src={active.media_url} autoPlay playsInline className="max-h-full max-w-full object-contain animate-scale-in" />
            : <img src={active.media_url} alt="" className="max-h-full max-w-full object-contain animate-scale-in" />}
        </div>
      )}
    </>
  );
}
