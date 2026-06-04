// Lovable AI NSFW moderation for feed media
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface ModerationResult {
  safe: boolean;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ safe: true, reason: "moderation-disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { imageUrl } = await req.json();
    if (!imageUrl || typeof imageUrl !== "string") {
      return new Response(JSON.stringify({ error: "imageUrl required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Call Lovable AI gateway with Gemini vision
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a strict NSFW content moderator. Analyze the image and respond with ONLY one of these exact words: SAFE, NSFW, VIOLENT. NSFW includes nudity, sexual content, suggestive poses, adult content. VIOLENT includes graphic violence, gore. Everything else is SAFE.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Classify this image:" },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Gateway error:", res.status, txt);
      // Fail open with warning so users aren't blocked on infra errors
      return new Response(JSON.stringify({ safe: true, reason: "moderation-unavailable" } as ModerationResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await res.json();
    const verdict = (data.choices?.[0]?.message?.content || "").toUpperCase().trim();
    const safe = verdict.startsWith("SAFE");
    return new Response(JSON.stringify({ safe, reason: safe ? undefined : verdict } as ModerationResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("moderate-content error", e);
    return new Response(JSON.stringify({ safe: true, reason: "moderation-error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
