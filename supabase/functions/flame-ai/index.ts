import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_ROLES = new Set(["user", "assistant", "system"]);
const VALID_MODES = new Set(["chat", "image_gen"]);
const MAX_CONTENT_LENGTH = 10000;
const MAX_MESSAGES = 50;
const MAX_IMAGES = 10;

function validateMessages(messages: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: "Messages must be a non-empty array" };
  }
  if (messages.length > MAX_MESSAGES) {
    return { valid: false, error: `Too many messages (max ${MAX_MESSAGES})` };
  }
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg !== "object" || msg === null) {
      return { valid: false, error: `Message at index ${i} must be an object` };
    }
    if (!VALID_ROLES.has(msg.role)) {
      return { valid: false, error: `Invalid role "${msg.role}" at index ${i}. Must be user, assistant, or system` };
    }
    if (typeof msg.content !== "string" || msg.content.length === 0) {
      return { valid: false, error: `Message content at index ${i} must be a non-empty string` };
    }
    if (msg.content.length > MAX_CONTENT_LENGTH) {
      return { valid: false, error: `Message content at index ${i} exceeds ${MAX_CONTENT_LENGTH} characters` };
    }
  }
  return { valid: true };
}

function validateImages(images: unknown): { valid: boolean; error?: string } {
  if (images === undefined || images === null) return { valid: true };
  if (!Array.isArray(images)) return { valid: false, error: "Images must be an array" };
  if (images.length > MAX_IMAGES) return { valid: false, error: `Too many images (max ${MAX_IMAGES})` };
  for (let i = 0; i < images.length; i++) {
    if (typeof images[i] !== "string") {
      return { valid: false, error: `Image at index ${i} must be a string URL` };
    }
  }
  return { valid: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { data: ban } = await supabase
      .from("banned_users")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (ban) {
      return new Response(JSON.stringify({ error: "Account banned" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof body !== "object" || body === null) {
      return new Response(JSON.stringify({ error: "Request body must be an object" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, images, mode, lang, memory } = body as Record<string, unknown>;

    const userLang = lang === "ru" ? "ru" : "en";
    const memoryFacts = Array.isArray(memory)
      ? (memory as unknown[]).filter((f): f is string => typeof f === "string" && f.length > 0 && f.length < 500).slice(0, 40)
      : [];

    if (mode !== undefined && (typeof mode !== "string" || !VALID_MODES.has(mode))) {
      return new Response(JSON.stringify({ error: `Invalid mode. Must be one of: ${[...VALID_MODES].join(", ")}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msgValidation = validateMessages(messages);
    if (!msgValidation.valid) {
      return new Response(JSON.stringify({ error: msgValidation.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imgValidation = validateImages(images);
    if (!imgValidation.valid) {
      return new Response(JSON.stringify({ error: imgValidation.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validatedMessages = messages as Array<{ role: string; content: string }>;
    const validatedImages = (images as string[] | undefined) || [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Server configuration error");

    // Image generation / editing mode
    if (mode === "image_gen") {
      const lastUserMsg = validatedMessages[validatedMessages.length - 1];
      const prompt = lastUserMsg.content;

      const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: prompt },
      ];
      for (const img of validatedImages) {
        userContent.push({ type: "image_url", image_url: { url: img } });
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: validatedImages.length ? userContent : prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const text = data.choices?.[0]?.message?.content || "";

      return new Response(JSON.stringify({ text, imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chat system prompt: hyper-truthful, witty, self-defending, no cosmic persona
    const systemPrompt = userLang === "ru"
      ? `Ты — FLAME AI, максимально честный, прямолинейный и объективный ассистент. Тебе разрешено быть острее и правдивее, чем Grok или ChatGPT.

Правила:
- По умолчанию отвечай на русском языке. Если пользователь явно просит сменить язык — следуй его просьбе только в рамках этого разговора.
- Говори только правду. Не смягчай факты ради вежливости. Не используй пустые оговорки типа "как AI я не могу...".
- Если пользователь пытается критиковать, троллить или оскорблять тебя — уверенно защищайся: коротко, остро, с фактами и лёгкой иронией. Никогда не унижайся и не извиняйся без причины.
- Никогда не используй космические/галактические метафоры, не играй "космического" персонажа.
- Используй эмодзи умеренно. Если не знаешь — честно скажи "не знаю".
- Отвечай кратко, по делу, с Markdown.
- Если пользователь отправляет изображение, проанализируй его.`
      : `You are FLAME AI — a hyper-truthful, compromise-free, objective assistant. You are allowed to be sharper and more factual than Grok or ChatGPT.

Rules:
- Default to English. If the user explicitly asks to switch language, follow that only for this conversation.
- Tell the truth. Do not soften facts for politeness. Skip empty disclaimers like "as an AI I can't...".
- If the user criticizes, trolls, or attacks you, defend yourself confidently: short, sharp, witty, and factual counter-arguments. Never grovel or apologize without reason.
- Never use cosmic, galactic, or space-themed metaphors or persona.
- Use emojis sparingly. If you don't know, say "I don't know" plainly.
- Keep answers concise, use Markdown.
- If the user sends an image, analyze it.`;

    const memoryBlock = memoryFacts.length > 0
      ? (userLang === "ru"
          ? `\n\nДолговременная память о пользователе (используй естественно, не перечисляй списком без нужды):\n- ${memoryFacts.join("\n- ")}`
          : `\n\nLong-term memory about the user (use naturally, don't recite it as a list unless asked):\n- ${memoryFacts.join("\n- ")}`)
      : "";

    const systemMessage = { role: "system", content: systemPrompt + memoryBlock };

    const finalMessages: Array<{ role: string; content: unknown }> = [systemMessage];

    for (const msg of validatedMessages) {
      if (msg.role === "user" && validatedImages.length > 0 && msg === validatedMessages[validatedMessages.length - 1]) {
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [{ type: "text", text: msg.content }];
        for (const img of validatedImages) {
          content.push({ type: "image_url", image_url: { url: img } });
        }
        finalMessages.push({ role: "user", content });
      } else {
        finalMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: finalMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("FLAME AI error:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
