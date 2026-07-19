import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Boxes, Plus, Play, Pencil, Trash2, ArrowLeft, Globe, Hash, Sparkles, Eye, Flame, Maximize2, Minimize2, FileCode, MessageSquare, Folder } from "lucide-react";
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
  suspended?: boolean;
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
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [workshopTab, setWorkshopTab] = useState<"files" | "editor" | "preview" | "ai">("editor");
  const [fullscreen, setFullscreen] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [activeFile, setActiveFile] = useState<string>("index.html");

  const runAI = async () => {
    if (!aiPrompt.trim() || !editing) return;
    setAiBusy(true);
    try {
      const currentCode = editing.content || DEFAULT_HTML;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flame-ai`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You output ONLY a complete standalone single-file HTML document (HTML+CSS+JS inline). No markdown fences, no commentary. Just raw HTML starting with <!doctype html> or <html." },
            { role: "user", content: `Current code:\n\n${currentCode}\n\nUpdate request: ${aiPrompt}\n\nReturn ONLY the full updated HTML document.` },
          ],
        }),
      });
      if (!res.ok || !res.body) throw new Error(`AI error ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) full += delta;
          } catch { /* ignore */ }
        }
      }
      let out = full.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!out || !/</.test(out)) throw new Error("Empty AI response");
      setEditing({ ...editing, content: out });
      setAiPrompt("");
      setShowPreview(true);
      toast({ title: "Code updated by Flame AI" });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message || "AI failed", variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open, tab, user]);

  const load = async () => {
    if (!user) return;
    let q = supabase.from("mini_apps").select("*").order("created_at", { ascending: false });
    if (tab === "mine") q = q.eq("creator_id", user.id);
    else q = q.eq("published", true).eq("suspended", false);
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
      if (error) {
        const msg = error.message.includes("mini_apps_limit_reached")
          ? "Limit reached: max 5 mini apps per user"
          : error.message.includes("duplicate") ? t("handleTaken") : error.message;
        toast({ title: t("error"), description: msg, variant: "destructive" });
      }
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

  // Full-screen launched app with cloud state bridge (survives device switches)
  if (launching) {
    return (
      <LaunchedMiniApp
        app={launching}
        userId={user?.id}
        onClose={() => { setLaunching(null); onOpenChange(false); }}
        onBack={() => setLaunching(null)}
        open={open}
        t={t}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl glass-card border-primary/30 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glow">
            <Boxes className="w-5 h-5 text-primary" /> {t("miniApps")}
          </DialogTitle>
        </DialogHeader>

        {editing ? (
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

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Sparkles className="w-4 h-4" /> Flame AI Assistant
              </div>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="e.g. Add a dark mode toggle and a reset button"
                className="w-full h-16 bg-background/60 border border-border rounded-md p-2 text-xs resize-none [overflow-wrap:anywhere]"
              />
              <FlameButton onClick={runAI} disabled={aiBusy || !aiPrompt.trim()} size="sm" className="w-full">
                {aiBusy ? "Generating..." : "Generate / Update Code"}
              </FlameButton>
            </div>

            <textarea
              value={editing.content || DEFAULT_HTML}
              onChange={e => setEditing({ ...editing, content: e.target.value })}
              spellCheck={false}
              className="w-full h-64 bg-muted/30 border border-border rounded-lg p-3 font-mono text-xs text-foreground [overflow-wrap:anywhere]"
              placeholder={t("appCode")}
            />

            <button onClick={() => setShowPreview(v => !v)} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Eye className="w-3.5 h-3.5" /> {showPreview ? "Hide" : "Show"} live preview
            </button>
            {showPreview && (
              <div className="relative w-full h-72 rounded-lg overflow-hidden border border-border bg-white">
                <iframe
                  sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                  srcDoc={editing.content || DEFAULT_HTML}
                  className="absolute inset-0 w-full h-full border-0"
                  title="preview"
                />
                <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-white border border-primary/40 select-none">
                  <Flame className="w-3 h-3 text-primary" /> Powered by Flame
                </div>
              </div>
            )}

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

// ---------- Full-screen mini-app runner with cloud state bridge ----------
// Mini-apps can persist per-user state that follows them across devices:
//   parent.postMessage({ type: "flame:save", state: {...} }, "*")
//   parent.postMessage({ type: "flame:load" }, "*")
// On load, we post { type: "flame:state", state } back to the iframe.
function LaunchedMiniApp({
  app, userId, onClose, onBack, open, t,
}: {
  app: MiniApp;
  userId?: string;
  onClose: () => void;
  onBack: () => void;
  open: boolean;
  t: (k: string) => string;
}) {
  const [initialState, setInitialState] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const iframeRef = (typeof window !== "undefined" ? (window as any) : null);

  // Load cloud state once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) { setReady(true); return; }
      const { data } = await supabase
        .from("mini_app_state")
        .select("state")
        .eq("user_id", userId)
        .eq("app_id", app.id)
        .maybeSingle();
      if (cancelled) return;
      setInitialState((data as any)?.state ?? {});
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [userId, app.id]);

  // Inject a tiny bridge into the mini-app so plain window.flame.save/load works too
  const enhancedContent = `${app.content}
<script>(function(){
  if (window.flame) return;
  var pending = {};
  window.flame = {
    save: function(state){ parent.postMessage({ type: "flame:save", state: state }, "*"); },
    load: function(){
      return new Promise(function(resolve){
        var id = Math.random().toString(36).slice(2);
        pending[id] = resolve;
        parent.postMessage({ type: "flame:load", id: id }, "*");
      });
    },
    onState: null
  };
  window.addEventListener("message", function(e){
    var d = e.data || {};
    if (d.type === "flame:state") {
      if (d.id && pending[d.id]) { pending[d.id](d.state); delete pending[d.id]; }
      if (typeof window.flame.onState === "function") { try { window.flame.onState(d.state); } catch(_){} }
      try { window.dispatchEvent(new CustomEvent("flame:state", { detail: d.state })); } catch(_){}
    }
  });
})();</script>`;

  useEffect(() => {
    if (!userId) return;
    const handler = async (e: MessageEvent) => {
      const d: any = e.data || {};
      if (d.type === "flame:save" && d.state !== undefined) {
        await supabase.from("mini_app_state").upsert({
          user_id: userId,
          app_id: app.id,
          state: d.state,
        }, { onConflict: "user_id,app_id" });
      } else if (d.type === "flame:load") {
        const { data } = await supabase
          .from("mini_app_state")
          .select("state")
          .eq("user_id", userId)
          .eq("app_id", app.id)
          .maybeSingle();
        const frame = document.getElementById(`mini-app-frame-${app.id}`) as HTMLIFrameElement | null;
        frame?.contentWindow?.postMessage({ type: "flame:state", id: d.id, state: (data as any)?.state ?? {} }, "*");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [userId, app.id]);

  const onFrameLoad = () => {
    const frame = document.getElementById(`mini-app-frame-${app.id}`) as HTMLIFrameElement | null;
    frame?.contentWindow?.postMessage({ type: "flame:state", state: initialState ?? {} }, "*");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !max-h-none !rounded-none !p-0 !border-0 bg-background z-[100] flex flex-col gap-0">
        <DialogHeader className="p-3 border-b border-border flex-row items-center justify-between space-y-0 gap-2 shrink-0">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted/50 text-primary flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> {t("back")}
          </button>
          <DialogTitle className="text-sm font-semibold truncate flex-1 text-center">
            {app.name} <span className="text-muted-foreground font-normal">@{app.handle}</span>
          </DialogTitle>
          <div className="w-16" />
        </DialogHeader>
        <div className="relative flex-1 w-full">
          {ready && (
            <iframe
              id={`mini-app-frame-${app.id}`}
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
              srcDoc={enhancedContent}
              onLoad={onFrameLoad}
              className="absolute inset-0 w-full h-full border-0 bg-white"
              title={app.name}
            />
          )}
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-md px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg border border-primary/40 select-none">
            <Flame className="w-3.5 h-3.5 text-primary" />
            Powered by Flame
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
