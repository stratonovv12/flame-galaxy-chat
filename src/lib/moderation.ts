import { supabase } from "@/integrations/supabase/client";

export interface ModerationVerdict {
  safe: boolean;
  reason?: string;
}

/**
 * Runs AI vision safety moderation on an image URL.
 * Fails open (safe) on infrastructure errors so users are never hard-blocked by outages.
 */
export async function moderateImageUrl(imageUrl: string): Promise<ModerationVerdict> {
  try {
    const { data, error } = await supabase.functions.invoke("moderate-content", {
      body: { imageUrl },
    });
    if (error) return { safe: true, reason: "moderation-unavailable" };
    return (data as ModerationVerdict) ?? { safe: true };
  } catch {
    return { safe: true, reason: "moderation-error" };
  }
}
