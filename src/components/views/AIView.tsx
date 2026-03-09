import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Send, Bot, User, Trash2, Plus, Image, MessageSquare, Menu, X, Brain } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

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
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImageGen, setIsImageGen] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (user) { loadTopics(); }
  }, [user]);

  useEffect(() => {
    if (activeTopic) loadMessages(activeTopic.id);
    else setMessages([]);
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
      .from("ai_topics").insert({ user_id: user.id, title: "Новый чат" }).select().single();
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

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Ошибка", description: "Только изображения", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAttachedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !attachedImage) || isLoading) return;

    let topic = activeTopic;
    if (!topic && user) {
      const { data } = await supabase
        .from("ai_topics").insert({ user_id: user.id, title: input.trim().slice(0, 50) || "Новый чат" }).select().single();
      if (data) { topic = data; setTopics(prev => [data, ...prev]); setActiveTopic(data); }
    }
    if (!topic) return;

    const userContent = input.trim() || (attachedImage ? "📷 Изображение" : "");
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
      setTopics(prev => prev.map(t => t.id === topic!.id ? { ...t, title: userContent.slice(0, 60) } : t));
    }

    const isImgGen = /(?:сгенерируй|нарисуй|создай|generate|draw|make).{0,20}(?:картинк|изображени|фото|image|picture|рисунок)/i.test(userContent);
    setIsImageGen(isImgGen);

    const tempAssistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: tempAssistantId, role: "assistant", content: "" }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Необходимо войти в аккаунт");

      if (isImgGen) {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flame-ai`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
            mode: "image_gen",
          }),
        });
        if (!response.ok) throw new Error("Ошибка генерации");
        const result = await response.json();
        setImageProgress(100);
        const assistantContent = result.text || "Вот сгенерированное изображение:";
        setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: assistantContent, imageUrl: result.imageUrl } : m));
        await saveMessage("assistant", assistantContent + (result.imageUrl ? `\n![image](${result.imageUrl})` : ""), topic.id);
      } else {
        const body: any = { messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })) };
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
          if (response.status === 429) throw new Error("Превышен лимит запросов");
          if (response.status === 402) throw new Error("Закончились кредиты AI");
          throw new Error("Ошибка сервера");
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
      toast({ title: "Ошибка AI", description: error instanceof Error ? error.message : "Неизвестная ошибка", variant: "destructive" });
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
        <Brain className="w-4 h-4 text-primary-foreground" />
      </div>
      <GlassCard className="p-3 max-w-[80%]">
        {isImageGen ? (
          <div className="space-y-2 min-w-[200px]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-spin" />
              <span className="text-sm text-primary font-medium">{t("imageGeneration")}</span>
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
            <span className="text-sm text-muted-foreground">Думаю...</span>
          </div>
        )}
      </GlassCard>
    </div>
  );

  return (
    <div className="flex h-full relative">
      {/* Sidebar */}
      <div className={`absolute inset-y-0 left-0 z-30 w-72 transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} bg-background/95 backdrop-blur-md border-r border-border`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-sm">{t("chatHistory")}</h3>
          <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-muted/50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-2">
          <button onClick={createNewTopic} className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-muted/50 text-sm text-primary transition-colors">
            <Plus className="w-4 h-4" /> {t("newChat")}
          </button>
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
      <div className="flex flex-col flex-1">
        <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-muted/50 rounded-lg transition-colors touch-target">
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center neon-glow-sm">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-lg">FLAME AI</h2>
              <p className="text-xs text-muted-foreground truncate">
                {activeTopic?.title || "Ваш умный помощник"}
              </p>
            </div>
          </div>
        </GlassCard>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {isLoadingHistory ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground mt-4">{t("loading")}</p>
            </div>
          ) : messages.length === 0 && !isLoading ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center neon-glow animate-float">
                <Sparkles className="w-10 h-10 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-glow">{t("helloFlame")}</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mb-4">
                {t("aiHint")}
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
                {["📷 Анализ фото", "🎨 Нарисуй картинку", "💡 Помоги с задачей"].map(hint => (
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
                        <Bot className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                    <GlassCard className={`max-w-[80%] p-3 ${message.role === "user" ? "bg-primary/20 border-primary/30" : ""}`}>
                      {message.imageUrl && (
                        <img src={message.imageUrl} alt="" className="max-h-64 rounded-lg object-cover mb-2" />
                      )}
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm prose-invert max-w-none">
                          <ReactMarkdown>{message.content || "..."}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm">{message.content}</p>
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

        <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageAttach} className="hidden" />
          <div className="flex gap-2 items-end">
            <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground touch-target">
              <Image className="w-5 h-5" />
            </button>
            <FlameInput
              placeholder="Спросите или попросите нарисовать..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              disabled={isLoading}
              className="flex-1"
            />
            <FlameButton onClick={sendMessage} disabled={isLoading || (!input.trim() && !attachedImage)}>
              {isLoading ? <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
            </FlameButton>
          </div>
        </div>
      </div>

      {sidebarOpen && <div className="absolute inset-0 z-20 bg-background/50" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}
