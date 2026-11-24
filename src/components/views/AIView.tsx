import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Send, Flame, User, Trash2, Plus, Image, MessageSquare, Menu, X, Gamepad2, Brain, Maximize2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { MiniGames } from "@/components/ui/MiniGames";
import { TextExpander } from "@/components/ui/TextExpander";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { AutoTextarea } from "@/components/ui/AutoTextarea";
import flameLogo from "@/assets/flame-logo.png";

const mdComponents = {
  code({ inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const raw = String(children ?? "");
    if (inline) return <CodeBlock inline code={raw} />;
    return <CodeBlock code={raw} language={match?.[1]} />;
  },
  pre({ children }: any) {
    // Avoid double-wrapping — CodeBlock already renders its own container
    return <>{children}</>;
  },
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

interface Topic {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function AIView() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [expandOpen, setExpandOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageGen, setIsImageGen] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [gamesOpen, setGamesOpen] = useState(false);
  const justCreatedTopicRef = useRef<string | null>(null);
  const [memoryOn, setMemoryOn] = useState<boolean>(() => {
    try { return localStorage.getItem("flame_ai_memory_enabled") !== "0"; } catch { return true; }
  });
  const memoryKey = user ? `flame_ai_memory_facts_${user.id}` : "";
  const readMemory = (): string[] => {
    if (!memoryOn || !memoryKey) return [];
    try { return JSON.parse(localStorage.getItem(memoryKey) || "[]"); } catch { return []; }
  };
  const writeMemory = (facts: string[]) => {
    if (!memoryKey) return;
    try { localStorage.setItem(memoryKey, JSON.stringify(facts.slice(-40))); } catch { /* ignore */ }
  };
  const toggleMemory = () => {
    const next = !memoryOn;
    setMemoryOn(next);
    try { localStorage.setItem("flame_ai_memory_enabled", next ? "1" : "0"); } catch { /* ignore */ }
    if (!next && memoryKey) {
      try { localStorage.removeItem(memoryKey); } catch { /* ignore */ }
      toast({ title: t("aiMemoryCleared") });
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (user) { loadTopics(); }
  }, [user]);

  useEffect(() => {
    if (!activeTopic) { setMessages([]); return; }
    // Skip reloading if this topic was just created within sendMessage — local state already has the messages.
    if (justCreatedTopicRef.current === activeTopic.id) {
      justCreatedTopicRef.current = null;
      return;
    }
    loadMessages(activeTopic.id);
  }, [activeTopic]);

  // Fake image progress animation
  useEffect(() => {
    if (!isImageGen) { setImageProgress(0); return; }
    const interval = setInterval(() => {
      setImageProgress(prev => {
        if (prev >= 90) return 90; // Hold at 90% until done
        return prev + Math.random() * 8;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isImageGen]);

  const loadTopics = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_topics").select("*").eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setTopics(data || []);
    // Don't auto-select a topic on load — start fresh, history in sidebar
    setIsLoadingHistory(false);
  };

  const loadMessages = async (topicId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_conversations").select("id, role, content")
      .eq("user_id", user.id).eq("topic_id", topicId)
      .order("created_at", { ascending: true });
    setMessages(data?.map(m => ({
      id: m.id, role: m.role as "user" | "assistant",
      content: m.content,
      imageUrl: m.content.match(/!\[image\]\((.*?)\)/)?.[1],
    })) || []);
  };

  const createNewTopic = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_topics").insert({ user_id: user.id, title: t("newChat") }).select().single();
    if (data) {
      setTopics(prev => [data, ...prev]);
      setActiveTopic(data);
      setMessages([]);
      setSidebarOpen(false);
    }
  };

  const deleteTopic = async (topicId: string) => {
    await supabase.from("ai_topics").delete().eq("id", topicId);
    setTopics(prev => prev.filter(t => t.id !== topicId));
    if (activeTopic?.id === topicId) { setActiveTopic(null); setMessages([]); }
  };

  const saveMessage = async (role: "user" | "assistant", content: string, topicId: string) => {
    if (!user) return null;
    const { data } = await supabase
      .from("ai_conversations").insert({ user_id: user.id, role, content, topic_id: topicId }).select("id").single();
    return data?.id;
  };

  const handleImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = "";
    if (!file.type.startsWith("image/")) {
      toast({ title: t("error"), description: t("onlyImages"), variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t("error"), description: "Max 10MB", variant: "destructive" });
      return;
    }
    if (!user) return;
    try {
      const path = `${user.id}/ai_${Date.now()}_${Math.random().toString(36).slice(2)}.${(file.name.split(".").pop() || "png").toLowerCase()}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
        upsert: false, contentType: file.type, cacheControl: "3600",
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      if (data?.publicUrl) setAttachedImage(data.publicUrl);
    } catch (err: any) {
      toast({ title: t("error"), description: err?.message || "Upload failed", variant: "destructive" });
    }
  };

  const sendMessage = async (override?: string) => {
    const prompt = override ?? input;
    if ((!prompt.trim() && !attachedImage) || isLoading) return;

    let topic = activeTopic;
    if (!topic && user) {
      const { data } = await supabase
        .from("ai_topics").insert({ user_id: user.id, title: prompt.trim().slice(0, 50) || t("newChat") }).select().single();
      if (data) { topic = data; justCreatedTopicRef.current = data.id; setTopics(prev => [data, ...prev]); setActiveTopic(data); }
    }
    if (!topic) return;

    const userContent = prompt.trim() || (attachedImage ? t("attachedImage") : "");
    const tempUserId = Date.now().toString();
    const userMessage: Message = { id: tempUserId, role: "user", content: userContent, imageUrl: attachedImage || undefined };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    const currentImage = attachedImage;
    setAttachedImage(null);
    setIsLoading(true);

    const savedUserId = await saveMessage("user", userContent, topic.id);
    if (savedUserId) setMessages(prev => prev.map(m => m.id === tempUserId ? { ...m, id: savedUserId } : m));

    if (messages.length === 0 && userContent.length > 2) {
      await supabase.from("ai_topics").update({ title: userContent.slice(0, 60) }).eq("id", topic.id);
      setTopics(prev => prev.map(t => t.id === topic.id ? { ...t, title: userContent.slice(0, 60) } : t));
    }

    const isPhotoEdit = !!currentImage && /(photoshop|enhance|улучш|отфотош|фотошоп|background|фон|filter|фильтр|стил|style|remove|убери|цвет|color)/i.test(userContent);
    const isImgGen = isPhotoEdit || /(?:сгенерируй|нарисуй|создай|generate|draw|make).{0,20}(?:картинк|изображени|фото|image|picture|рисунок)/i.test(userContent);
    setIsImageGen(isImgGen);

    const memoryFacts = readMemory();

    const tempAssistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: tempAssistantId, role: "assistant", content: "" }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("mustSignIn"));

      if (isImgGen) {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flame-ai`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })), lang,
            mode: "image_gen",
            images: currentImage ? [currentImage] : undefined,
            memory: memoryFacts,
          }),
        });
        if (!response.ok) throw new Error(t("imageGenError"));
        const result = await response.json();
        setImageProgress(100);
        const assistantContent = result.text || t("generatedImage");
        setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: assistantContent, imageUrl: result.imageUrl } : m));
        await saveMessage("assistant", assistantContent + (result.imageUrl ? `\n![image](${result.imageUrl})` : ""), topic.id);
      } else {
        const body: any = { messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })), lang, memory: memoryFacts };
        if (currentImage) body.images = [currentImage];
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flame-ai`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          if (response.status === 429) throw new Error(t("rateLimitExceeded"));
          if (response.status === 402) throw new Error(t("aiCreditsExhausted"));
          throw new Error(t("serverError"));
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let textBuffer = "";
        let assistantContent = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: assistantContent } : m));
              }
            } catch {
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }
        if (assistantContent) await saveMessage("assistant", assistantContent, topic.id);
      }
    } catch (error) {
      toast({ title: t("aiError"), description: error instanceof Error ? error.message : t("unknownError"), variant: "destructive" });
      setMessages(prev => prev.filter(m => m.id !== tempAssistantId));
    } finally {
      setIsLoading(false);
      setIsImageGen(false);
    }
  };

  // Thinking animation component with pulsing
  const ThinkingIndicator = () => (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 animate-ai-pulse">
        <img src={flameLogo} alt="FLAME AI" className="w-8 h-8 rounded-lg object-cover" />
      </div>
      <GlassCard className="p-3 max-w-[80%]">
        {isImageGen ? (
          <div className="space-y-2 min-w-[200px]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-spin" />
              <span className="text-sm text-primary font-medium">{t("aiDrawing")}</span>
            </div>
            <Progress value={imageProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">{Math.round(imageProgress)}%</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
            </div>
            <span className="text-sm text-muted-foreground">{t("thinking")}</span>
          </div>
        )}
      </GlassCard>
    </div>
  );

  return (
    <div className="flex h-full relative w-full max-w-full overflow-x-hidden">
      {/* Sidebar */}
      <div className={`absolute inset-y-0 left-0 z-30 w-72 transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} bg-background/95 backdrop-blur-md border-r border-border`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-sm">{t("chatHistory")}</h3>
          <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-muted/50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-2 space-y-1">
          <button onClick={createNewTopic} className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-muted/50 text-sm text-primary transition-colors">
            <Plus className="w-4 h-4" /> {t("newChat")}
          </button>
          <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Brain className={`w-4 h-4 shrink-0 ${memoryOn ? "text-primary" : "text-muted-foreground"}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t("aiMemory" as any) || "AI Memory"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{memoryOn ? (t("aiMemoryOn") as string) : (t("aiMemoryOff") as string)}</p>
              </div>
            </div>
            <Switch checked={memoryOn} onCheckedChange={toggleMemory} />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1" style={{ maxHeight: "calc(100% - 120px)" }}>
          {topics.map(topic => (
            <div key={topic.id} className={`group flex items-center gap-2 p-3 rounded-lg cursor-pointer text-sm transition-colors ${activeTopic?.id === topic.id ? "bg-primary/20 text-primary" : "hover:bg-muted/50"}`}
              onClick={() => { setActiveTopic(topic); setSidebarOpen(false); }}>
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{topic.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteTopic(topic.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-all">
                <Trash2 className="w-3 h-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 max-w-full overflow-x-hidden">
        <GlassCard className="conversation-header rounded-none border-x-0 border-t-0 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-lg shrink-0 overflow-hidden">
              <img src={flameLogo} alt="FLAME AI" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg">FLAME AI</h2>
              <p className="text-xs text-muted-foreground truncate">
                {activeTopic?.title || t("yourSmartAssistant")}
              </p>
            </div>
            {/* AI Memory toggle moved to the chat history sidebar to keep the mobile header compact. */}
            <button onClick={() => setGamesOpen(true)} title={t("miniGames")}
              className="p-2 rounded-lg bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary touch-target transition-colors">
              <Gamepad2 className="w-5 h-5" />
            </button>
          </div>
        </GlassCard>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 custom-scrollbar">
          {isLoadingHistory ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground mt-4">{t("loading")}</p>
            </div>
          ) : messages.length === 0 && !isLoading ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center neon-glow animate-float">
                <img src={flameLogo} alt="FLAME AI" className="w-full h-full rounded-xl object-cover" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-glow">{t("helloFlame")}</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mb-4">
                {t("aiHint")}
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
                {[t("analyzePhoto"), t("drawPicture"), t("helpWithTask")].map(hint => (
                  <button key={hint} onClick={() => setInput(hint)} className="px-3 py-1.5 rounded-full text-xs bg-muted/50 hover:bg-primary/20 transition-colors border border-border">
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(message => {
                // Skip empty assistant messages when loading (they're shown as ThinkingIndicator)
                if (message.role === "assistant" && !message.content && isLoading) return null;
                return (
                  <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    {message.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                        <img src={flameLogo} alt="FLAME AI" className="w-full h-full rounded-lg object-cover" />
                      </div>
                    )}
                    <GlassCard className={`max-w-[80%] min-w-0 p-3 break-words [overflow-wrap:anywhere] ${message.role === "user" ? "bg-primary/20 border-primary/30" : ""}`}>
                      {message.imageUrl && (
                        <>
                          <img src={message.imageUrl} alt="" className="max-w-full max-h-64 rounded-lg object-cover mb-2" />
                          {message.role === "assistant" && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {[t("enhanceQuality"), t("changeStyle"), t("cyberpunkFilter")].map(tag => (
                                <button key={tag}
                                  onClick={() => { setInput(`${tag}: ${message.content.slice(0, 60)}`); }}
                                  className="px-2.5 py-1 rounded-full text-[11px] bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary transition-colors">
                                  {tag}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm prose-invert max-w-none break-words [overflow-wrap:anywhere]">
                          <ReactMarkdown components={mdComponents}>{message.content || "..."}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                      )}
                    </GlassCard>
                    {message.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}
              {isLoading && <ThinkingIndicator />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {attachedImage && (
          <div className="px-4 pb-2">
            <div className="relative inline-block">
              <img src={attachedImage} alt="Attached" className="max-h-24 rounded-lg object-cover" />
              <button onClick={() => setAttachedImage(null)} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        <div className="compact-composer p-2 bg-background border-t border-border ipad-input">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageAttach} className="hidden" />
          <div className="flex gap-1 items-end">
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} aria-label={t("attachedImage")}><Image /></Button>
            <div className="flex-1 min-w-0 relative">
              <AutoTextarea aria-label={t("askOrDraw")} placeholder={t("askOrDraw")} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} disabled={isLoading} className="w-full px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <Button variant="ghost" size="icon" className="absolute right-0 bottom-0" onClick={() => setExpandOpen(true)} aria-label={t("expandText")}><Maximize2 /></Button>
            </div>
            <Button size="icon" onClick={() => void sendMessage()} disabled={isLoading || (!input.trim() && !attachedImage)} aria-label={t("send")}>
              {isLoading ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Send />}
            </Button>
          </div>
        </div>
        <TextExpander open={expandOpen} onOpenChange={setExpandOpen} value={input} onChange={setInput} onSend={text => void sendMessage(text)} />
      </div>

      {sidebarOpen && <div className="absolute inset-0 z-20 bg-background/50" onClick={() => setSidebarOpen(false)} />}
      <MiniGames open={gamesOpen} onOpenChange={setGamesOpen} />
      
    </div>
  );
}
