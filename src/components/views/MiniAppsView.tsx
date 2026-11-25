import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Boxes, Plus, Play, Pencil, Trash2, ArrowLeft, Globe, Hash, Sparkles, Eye, Flame, Maximize2, Minimize2, FileCode, MessageSquare, Folder, Gem, BadgeCheck, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FigurinesView } from "@/components/views/FigurinesView";
import { uploadToMedia } from "@/lib/uploads";
import flameLogoAsset from "@/assets/flame-mark.png.asset.json";
const flameLogo = flameLogoAsset.url;
import { FlameBadge } from "@/components/ui/FlameBadge";
import { readProject, editProjectFile, validateProject, projectPreview } from "@/lib/workshop-project";
import { Button } from "@/components/ui/button";


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
  embedded?: boolean;
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

export function MiniAppsView({ open, onOpenChange, embedded = false }: Props) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [editing, setEditing] = useState<Partial<MiniApp> | null>(null);
  const [launching, setLaunching] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [workshopTab, setWorkshopTab] = useState<"files" | "editor" | "preview" | "ai">("editor");
  const [fullscreen, setFullscreen] = useState(false);
  const [activeFile, setActiveFile] = useState<string>("index.html");
  const [collectiblesOpen, setCollectiblesOpen] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const currentProject = readProject(editing?.content || DEFAULT_HTML);
  const preview = projectPreview(editing?.content || DEFAULT_HTML);
  const selectedFile = activeFile in currentProject.files ? activeFile : "index.html";
  useEffect(() => () => aiAbort.current?.abort(), []);
  // Per-tab full screen: the currently expanded workshop panel (null = normal layout)
  const [panelFull, setPanelFull] = useState<null | "files" | "editor" | "preview" | "ai">(null);

  const panelWrap = (key: "files" | "editor" | "preview" | "ai", children: React.ReactNode) => (
    <div className={panelFull === key
      ? "fixed inset-0 z-[80] bg-background p-3 pt-12 overflow-y-auto"
      : "relative"}>
      {panelFull === key && <span data-dock-obstruction="true" />}
      <Button variant="secondary" size="icon"
        onClick={() => setPanelFull(p => (p === key ? null : key))}
        className="absolute top-2 right-2 z-10"
        aria-label={panelFull === key ? t("exitFullScreen") : t("fullScreen")}
        title={panelFull === key ? t("exitFullScreen") : t("fullScreen")}>
        {panelFull === key ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </Button>
      {children}
    </div>
  );

  const uploadIcon = async (file?: File) => {
    if (!file || !user || !editing) return;
    setIconUploading(true);
    try {
      const url = await uploadToMedia(file, user.id, "app-icons");
      setEditing({ ...editing, icon: url });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    }
    setIconUploading(false);
  };


  const runAI = async () => {
    if (!aiPrompt.trim() || !editing) return;
    setAiBusy(true);
    const controller = new AbortController();
    aiAbort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const currentCode = editing.content || DEFAULT_HTML;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flame-ai`;
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          mode: "workshop",
          lang,
          messages: [
            { role: "user", content: `Current complete project snapshot:\n${JSON.stringify(readProject(currentCode))}\n\nUpdate request: ${aiPrompt}\nReturn a complete modular project, preserving existing features. Plan first, then implement and self-review.` },
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
        const parts = buffer.split("\n");
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
      const lastLine = buffer.trim();
      if (lastLine.startsWith("data:") && lastLine.slice(5).trim() !== "[DONE]") {
        const chunk = JSON.parse(lastLine.slice(5).trim());
        full += chunk.choices?.[0]?.delta?.content || "";
      }
      const out = full.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const project = validateProject(JSON.parse(out));
      const checked = projectPreview(JSON.stringify(project));
      if (checked.error) throw new Error(checked.error);
      setEditing({ ...editing, content: JSON.stringify(project) });
      setActiveFile("index.html");
      setAiPrompt("");
      setWorkshopTab("preview");
      toast({ title: t("workshopUpdated") });
    } catch (e: any) {
      toast({ title: t("workshopError"), description: e.message, variant: "destructive" });
    } finally {
      setAiBusy(false);
      clearTimeout(timeout);
      aiAbort.current = null;
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
      icon: editing.icon || null,

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

  const content = (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <img src={flameLogo} alt="" width={28} height={28} loading="lazy"
              className="w-7 h-7 rounded-lg" />
            <span>{t("miniAppWorkshop")}</span>
          </h1>
        </header>

        {editing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-sm text-primary hover:underline">
                <ArrowLeft className="w-4 h-4" /> {t("back")}
              </button>
              <button
                onClick={() => setFullscreen(f => !f)}
                className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                title={fullscreen ? t("exitFullscreen") : t("fullscreen")}>
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>

            <FlameInput placeholder={t("appName")} value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <FlameInput placeholder="unique_handle" value={editing.handle || ""} onChange={e => setEditing({ ...editing, handle: e.target.value })} className="pl-9" />
            </div>
            <FlameInput placeholder={t("appDescription")} value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />

            {/* App avatar / logo */}
            <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/20">
              <div className="w-12 h-12 rounded-lg bg-primary/15 border border-primary/30 overflow-hidden flex items-center justify-center shrink-0">
                {editing.icon
                  ? <img src={editing.icon} alt="" className="w-full h-full object-cover" />
                  : <Boxes className="w-5 h-5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t("appAvatar")}</p>
                <p className="text-[11px] text-muted-foreground truncate">PNG / JPG</p>
              </div>
              <button onClick={() => iconInput.current?.click()} disabled={iconUploading}
                className="p-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary shrink-0">
                {iconUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              </button>
              <input ref={iconInput} type="file" accept="image/*" className="hidden"
                onChange={e => { uploadIcon(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-muted/30 border border-border">
              {([
                ["files", t("files"), Folder],
                ["editor", t("editor"), FileCode],
                ["preview", t("preview"), Eye],
                ["ai", t("aiChat"), MessageSquare],
              ] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setWorkshopTab(k)}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-md text-[10px] font-semibold transition-colors ${workshopTab === k ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(127,90,240,0.4)]" : "text-muted-foreground hover:bg-muted/50"}`}>
                  <Icon className="w-4 h-4" />
                  <span className="truncate w-full text-center">{label}</span>
                </button>
              ))}
            </div>

            {workshopTab === "files" && panelWrap("files", (
              <div className={`rounded-lg border border-border bg-muted/20 p-3 space-y-1 ${panelFull === "files" ? "min-h-[80vh]" : "min-h-[200px]"}`}>
                {Object.keys(currentProject.files).map(f => (
                  <button
                    key={f}
                    onClick={() => { setActiveFile(f); setWorkshopTab("editor"); }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${activeFile === f ? "bg-primary/20 text-primary" : "hover:bg-muted/40 text-muted-foreground"}`}>
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{f}</span>
                  </button>
                ))}
              </div>
            ))}

            {workshopTab === "editor" && panelWrap("editor", (
              <textarea
                aria-label={selectedFile}
                value={currentProject.files[selectedFile]}
                disabled={aiBusy}
                onChange={e => setEditing({ ...editing, content: JSON.stringify(editProjectFile(currentProject, selectedFile, e.target.value)) })}
                spellCheck={false}
                className={`w-full ${panelFull === "editor" ? "h-[85vh]" : fullscreen ? "h-[60vh]" : "h-64"} bg-muted/30 border border-border rounded-lg p-3 font-mono text-xs text-foreground [overflow-wrap:anywhere]`}
                placeholder={t("appCode")}
              />
            ))}

            {workshopTab === "preview" && panelWrap("preview", (
              <div className={`relative w-full ${panelFull === "preview" ? "h-[85vh]" : fullscreen ? "h-[60vh]" : "h-72"} rounded-lg overflow-hidden border border-border bg-card`}>
                {preview.error ? <p role="alert" className="p-4 text-destructive text-sm">{preview.error}</p> : <iframe
                  sandbox="allow-scripts allow-forms allow-popups"
                  srcDoc={preview.html}
                  className="absolute inset-0 w-full h-full border-0"
                  title="preview"
                />}
                <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/90 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-foreground border border-border select-none">
                  <Flame className="w-3 h-3 text-primary" /> Powered by Flame
                </div>
              </div>
            ))}

            {workshopTab === "ai" && panelWrap("ai", (
              <div className={`rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 ${panelFull === "ai" ? "min-h-[80vh]" : ""}`}>
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <img src={flameLogo} alt="" className="w-6 h-6 rounded" /> FLAME AI
                </div>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  disabled={aiBusy}
                  aria-label={t("workshopRequest")}
                  placeholder={t("workshopRequest")}
                  className={`w-full ${panelFull === "ai" ? "h-[60vh]" : "h-32"} bg-background border border-border rounded-md p-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground resize-none [overflow-wrap:anywhere]`}
                />
                <FlameButton onClick={runAI} disabled={aiBusy || !aiPrompt.trim()} size="sm" className="w-full">
                  {aiBusy ? t("workshopGenerating") : t("workshopGenerate")}
                </FlameButton>
                {currentProject.plan.length > 0 && <div className="text-sm space-y-2"><h4 className="font-semibold">{t("workshopPlan")}</h4><ol className="list-decimal pl-5 space-y-1">{currentProject.plan.map((step, index) => <li key={index}>{step}</li>)}</ol></div>}
              </div>
            ))}


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
            <div className="space-y-2 flex-1 overflow-y-auto">
              {/* Official built-in mini-app */}
              <GlassCard className="p-3 border-primary/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center overflow-hidden">
                    <img src={flameLogo} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate flex items-center gap-1">
                      {t("flameMarketplace")} <FlameBadge size={14} />
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate">{t("officialApp")} · @marketplace</p>
                  </div>
                  <button onClick={() => setCollectiblesOpen(true)} className="p-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary shrink-0" title={t("launch")}>
                    <Play className="w-4 h-4" />
                  </button>
                </div>
              </GlassCard>
              {apps.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">{t("noMiniApps")}</p>
              ) : apps.map(a => (

                <GlassCard key={a.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 overflow-hidden flex items-center justify-center">
                      {a.icon
                        ? <img src={a.icon} alt="" className="w-full h-full object-cover" />
                        : <Boxes className="w-5 h-5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate flex items-center gap-1">
                        {a.name}
                        {(a as any).verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                      </h3>
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
        <FigurinesView open={collectiblesOpen} onOpenChange={setCollectiblesOpen} />
    </div>
  );
  if (!open) return null;
  if (embedded) return content;
  return <div data-dock-obstruction="true" className="fixed inset-0 z-[80] bg-background overflow-y-auto">{content}</div>;
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
  const compiled = projectPreview(app.content);
  const enhancedContent = `${compiled.html}
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
      const sourceFrame = document.getElementById(`mini-app-frame-${app.id}`) as HTMLIFrameElement | null;
      if (!sourceFrame?.contentWindow || e.source !== sourceFrame.contentWindow) return;
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
          {compiled.error && <p role="alert" className="p-4 text-destructive">{compiled.error}</p>}
          {ready && !compiled.error && (
            <iframe
              id={`mini-app-frame-${app.id}`}
              sandbox="allow-scripts allow-forms allow-popups"
              srcDoc={enhancedContent}
              onLoad={onFrameLoad}
              className="absolute inset-0 w-full h-full border-0 bg-card"
              title={app.name}
            />
          )}
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-background/90 backdrop-blur-md px-3 py-1.5 text-[11px] font-semibold text-foreground border border-border select-none">
            <Flame className="w-3.5 h-3.5 text-primary" />
            Powered by Flame
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
