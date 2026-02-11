import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Video } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VideoCircleRecorderProps {
  onRecorded: (url: string) => void;
  className?: string;
}

export function VideoCircleRecorder({ onRecorded, className }: VideoCircleRecorderProps) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    if (!user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 480, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (blob.size < 1000) { setPreview(false); return; }

        setUploading(true);
        try {
          const filePath = `${user.id}/${Date.now()}_circle.webm`;
          const { error } = await supabase.storage.from("media").upload(filePath, blob, { cacheControl: "3600", upsert: true });
          if (error) throw error;
          const { data } = await supabase.storage.from("media").createSignedUrl(filePath, 60 * 60 * 24 * 365);
          if (data?.signedUrl) onRecorded(data.signedUrl);
        } catch (err: any) {
          toast({ title: "Ошибка", description: err.message, variant: "destructive" });
        } finally {
          setUploading(false);
          setPreview(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
      setPreview(true);

      // Auto-stop after 30s
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopRecording();
        }
      }, 30000);
    } catch {
      toast({ title: "Ошибка", description: "Нет доступа к камере", variant: "destructive" });
    }
  }, [user, onRecorded]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  return (
    <>
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={uploading}
        className={`p-2 rounded-lg transition-colors touch-target ${
          recording
            ? "bg-destructive/20 text-destructive animate-pulse"
            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
        } ${className || ""}`}
        title="Записать видео-кружок"
      >
        {uploading ? (
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Video className="w-5 h-5" />
        )}
      </button>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-64 h-64 rounded-full object-cover border-4 border-primary neon-glow"
            />
            <p className="text-sm text-muted-foreground">
              {recording ? "Запись... Нажмите чтобы остановить" : "Загрузка..."}
            </p>
            {recording && (
              <button
                onClick={stopRecording}
                className="px-6 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium"
              >
                Остановить
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
