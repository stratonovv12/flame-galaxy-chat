import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Sparkles, Send, Bot, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AIView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";
    const assistantId = (Date.now() + 1).toString();

    // Add empty assistant message that we'll update
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flame-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Превышен лимит запросов. Попробуйте позже.");
        }
        if (response.status === 402) {
          throw new Error("Закончились кредиты AI. Обратитесь к администратору.");
        }
        throw new Error("Ошибка сервера");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      let textBuffer = "";

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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: assistantContent } : m
                )
              );
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Неизвестная ошибка";
      toast({
        title: "Ошибка AI",
        description: errorMessage,
        variant: "destructive",
      });
      // Remove the empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <GlassCard className="rounded-none border-x-0 border-t-0 p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center neon-glow-sm">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-lg">FLAME AI</h2>
            <p className="text-sm text-muted-foreground">
              Ваш умный помощник
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center neon-glow animate-float">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-glow">
              Привет! Я FLAME AI
            </h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Задайте мне любой вопрос, и я постараюсь помочь вам!
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              <GlassCard
                className={`max-w-[80%] p-3 ${
                  message.role === "user"
                    ? "bg-primary/20 border-primary/30"
                    : ""
                }`}
              >
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
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 glass-card rounded-none border-x-0 border-b-0 ipad-input">
        <div className="flex gap-2">
          <FlameInput
            placeholder="Спросите что-нибудь..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            disabled={isLoading}
            className="flex-1"
          />
          <FlameButton onClick={sendMessage} disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </FlameButton>
        </div>
      </div>
    </div>
  );
}
