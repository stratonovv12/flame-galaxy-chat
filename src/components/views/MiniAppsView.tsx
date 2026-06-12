import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Boxes, Plus, Play, Pencil, Trash2, ArrowLeft, Globe, Hash } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MiniApp {
  id: string;
  creator_id: string;
  handle: string;
  name: string;
  description: string | null;
  icon: string | null;
  app_type: "html" | "python";
  content: string;
  published: boolean;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const DEFAULT_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
body{font-family:system-ui;background:#1a1a2e;color:#fff;padding:24px;text-align:center}
button{background:#7f5af0;color:#fff;border:0;padding:12px 20px;border-radius:8px;font-size:16px;cursor:pointer}
</style></head>
<body>
  <h1>Hello from your Mini App</h1>
  <p id="count">Clicks: 0</p>
  <button onclick="c++;document.getElementById('count').innerText='Clicks: '+c">Tap me</button>
  <script>let c=0;</script>
</body></html>`;

export function MiniAppsView({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [editing, setEditing] = useState<Partial<MiniApp> | null>(null);
  const [launching, setLaunching] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) load(); }, [open, tab, user]);

  const load = async () => {
    if (!user) return;
    let q = supabase.from("mini_apps").select("*").order("created_at", { ascending: false });
    if (tab === "mine") q = q.eq("creator_id", user.id);
    else q = q.eq("published", true);
    const { data } = await q;
    setApps((data as MiniApp[]) || []);
  };

  const save = async () => {
    if (!user || !editing) return;
    const handle = (editing.handle || "").replace(/^@/, "").toLowerCase().trim();
    if (!editing.name || !handle) {
      toast({ title: t("error"), description: t("fillAllFields"), variant: "destructive" });
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
      toast({ title: t("error"), description: "handle: a-z, 0-9, _ (3-24)", variant: "destructive" });
      return;
    }
    setLoading(true);
    const payload = {
      creator_id: user.id,
      handle,
      name: editing.name,
      description: editing.description || null,
      app_type: "html" as const,
      content: editing.content || DEFAULT_HTML,
      published: editing.published ?? false,
    };
    if (editing.id) {
      const { error } = await supabase.from("mini_apps").update(payload).eq("id", editing.id);
      if (error) toast({ title: t("error"), description: error.message.includes("duplicate") ? t("handleTaken") : error.message, variant: "destructive" });
      else { toast({ title: t("appUpdated") }); setEditing(null); load(); }
    } else {
      const { error } = await supabase.from("mini_apps").insert(payload);
      if (error) toast({ title: t("error"), description: error.message.includes("duplicate") ? t("handleTaken") : error.message, variant: "destructive" });
      else { toast({ title: t("appCreated") }); setEditing(null); load(); }
    }
    setLoading(false);
  };

  const del = async (id: string) => {
    if (!confirm(t("deletePostConfirm"))) return;
    await supabase.from("mini_apps").delete().eq("id", id);
    toast({ title: t("appDeleted") });
    load();
  };

  const togglePublish = async (a: MiniApp) => {
    await supabase.from("mini_apps").update({ published: !a.published }).eq("id", a.id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl glass-card border-primary/30 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glow">
            <Boxes className="w-5 h-5 text-primary" /> {t("miniApps")}
          </DialogTitle>
        </DialogHeader>

        {launching ? (
          <div className="space-y-3">
            <button onClick={() => setLaunching(null)} className="flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> {t("back")}
            </button>
            <div className="text-center">
              <h3 className="font-bold text-lg">{launching.name}</h3>
              <p className="text-xs text-muted-foreground">@{launching.handle}</p>
            </div>
            <iframe
              sandbox="allow-scripts"
              srcDoc={launching.content}
              className="w-full h-[60vh] rounded-lg border border-border bg-white"
              title={launching.name}
            />
          </div>
        ) : editing ? (
          <div className="space-y-3">
            <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> {t("back")}
            </button>
            <FlameInput placeholder={t("appName")} value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <FlameInput placeholder="unique_handle" value={editing.handle || ""} onChange={e => setEditing({ ...editing, handle: e.target.value })} className="pl-9" />
            </div>
            <FlameInput placeholder={t("appDescription")} value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            <textarea
              value={editing.content || DEFAULT_HTML}
              onChange={e => setEditing({ ...editing, content: e.target.value })}
              spellCheck={false}
              className="w-full h-64 bg-muted/30 border border-border rounded-lg p-3 font-mono text-xs text-foreground"
              placeholder={t("appCode")}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!editing.published} onChange={e => setEditing({ ...editing, published: e.target.checked })} />
              <Globe className="w-4 h-4" /> {t("publishApp")}
            </label>
            <FlameButton onClick={save} disabled={loading} className="w-full">{loading ? "..." : t("save")}</FlameButton>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button onClick={() => setTab("all")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "all" ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"}`}>{t("allApps")}</button>
              <button onClick={() => setTab("mine")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "mine" ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"}`}>{t("myApps")}</button>
            </div>
            <FlameButton onClick={() => setEditing({ name: "", handle: "", content: DEFAULT_HTML, published: false })} className="w-full">
              <Plus className="w-4 h-4 mr-2" /> {t("createMiniApp")}
            </FlameButton>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {apps.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">{t("noMiniApps")}</p>
              ) : apps.map(a => (
                <GlassCard key={a.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Boxes className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{a.name}</h3>
                      <p className="text-[11px] text-muted-foreground truncate">@{a.handle}{a.description ? ` · ${a.description}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setLaunching(a)} className="p-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary" title={t("launch")}>
                        <Play className="w-4 h-4" />
                      </button>
                      {a.creator_id === user?.id && (
                        <>
                          <button onClick={() => togglePublish(a)} className={`p-2 rounded-lg ${a.published ? "text-primary" : "text-muted-foreground"} hover:bg-muted/50`} title={a.published ? t("unpublishApp") : t("publishApp")}>
                            <Globe className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditing(a)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground" title={t("editApp")}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => del(a.id)} className="p-2 rounded-lg hover:bg-destructive/20 text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
