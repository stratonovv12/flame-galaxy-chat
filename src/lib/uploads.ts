import { supabase } from "@/integrations/supabase/client";

/** Upload a file picked from the device gallery to the public media bucket. */
export async function uploadToMedia(file: File, userId: string, folder = "uploads"): Promise<string> {
  const ext = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "png";
  const path = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { cacheControl: "3600", upsert: true });
  if (error) throw error;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

export const STICKER_MARKER = "/stickers/";
export const isStickerUrl = (url?: string | null) => !!url && url.includes(STICKER_MARKER);

/** Legacy "media" caption placeholders that must never be shown as message text. */
export const isMediaPlaceholder = (content?: string | null) =>
  !content || /^(📎|📷|#)?\s*(media|медиа)$/i.test(content.trim());

