import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PendingUpload {
  id: string;
  type: "voice" | "circle";
  localUrl: string;
  progress: number;
  blob: Blob;
  abortController: AbortController | null;
  xhrRef: XMLHttpRequest | null;
}

export function useMediaUpload() {
  const { user } = useAuth();
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  const startUpload = useCallback(
    async (
      blob: Blob,
      type: "voice" | "circle",
      onComplete: (url: string) => void
    ) => {
      if (!user) return;

      const localUrl = URL.createObjectURL(blob);
      const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const ext = type === "voice" ? "webm" : "webm";
      const filePath = `${user.id}/${Date.now()}_${type === "voice" ? "voice" : "circle"}.${ext}`;
      const contentType = type === "voice" ? "audio/webm" : "video/webm";

      const pending: PendingUpload = {
        id,
        type,
        localUrl,
        progress: 0,
        blob,
        abortController: null,
        xhrRef: null,
      };

      setPendingUploads((prev) => [...prev, pending]);

      try {
        // Get auth token for upload
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("No session");

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const storageUrl = `${supabaseUrl}/storage/v1/object/media/${filePath}`;

        // Use XHR for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          // Store XHR ref for cancellation
          setPendingUploads((prev) =>
            prev.map((p) => (p.id === id ? { ...p, xhrRef: xhr } : p))
          );

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setPendingUploads((prev) =>
                prev.map((p) => (p.id === id ? { ...p, progress: pct } : p))
              );
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Upload error")));
          xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

          xhr.open("POST", storageUrl);
          xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
          xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
          xhr.setRequestHeader("Content-Type", contentType);
          xhr.setRequestHeader("x-upsert", "true");
          xhr.setRequestHeader("Cache-Control", "max-age=3600");
          xhr.send(blob);
        });

        // Get public URL
        const { data } = supabase.storage.from("media").getPublicUrl(filePath);
        if (data?.publicUrl) {
          onComplete(data.publicUrl);
        }

        // Remove from pending
        setPendingUploads((prev) => prev.filter((p) => p.id !== id));
        URL.revokeObjectURL(localUrl);
      } catch (err: any) {
        if (err.message === "Upload cancelled") {
          // Already cleaned up
        } else {
          console.error("Upload error:", err);
        }
        setPendingUploads((prev) => prev.filter((p) => p.id !== id));
        URL.revokeObjectURL(localUrl);
      }
    },
    [user]
  );

  const cancelUpload = useCallback((id: string) => {
    setPendingUploads((prev) => {
      const upload = prev.find((p) => p.id === id);
      if (upload?.xhrRef) {
        upload.xhrRef.abort();
      }
      if (upload?.localUrl) {
        URL.revokeObjectURL(upload.localUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  return { pendingUploads, startUpload, cancelUpload };
}
