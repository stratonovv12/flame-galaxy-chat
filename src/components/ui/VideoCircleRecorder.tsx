import { useState, useRef, useCallback, useEffect } from "react";
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
  const [duration, setDuration] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startRecording = useCallback(async (e: React.PointerEvent) => {
    if (!user || uploading) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    cancelledRef.current = false;
    setCancelled(false);

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

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";

      const mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 1000000,
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setDuration(0);

        if (cancelledRef.current) { setCancelled(false); return; }

        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "video/webm" });
        if (blob.size < 1000) return;

        setUploading(true);
        try {
          const filePath = `${user.id}/${Date.now()}_circle.webm`;
          const { error } = await supabase.storage.from("media").upload(filePath, blob, {
            cacheControl: "3600", upsert: true, contentType: "video/webm",
          });
          if (error) throw error;
          const { data } = supabase.storage.from("media").getPublicUrl(filePath);
          if (data?.publicUrl) onRecorded(data.publicUrl);
        } catch (err: any) {
          toast({ title: "Ошибка", description: err.message, variant: "destructive" });
        } finally {
          setUploading(false);
        }
      };

      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(prev => {
        if (prev >= 29) { stopRecording(); return 0; }
        return prev + 1;
      }), 1000);
    } catch {
      toast({ title: "Ошибка", description: "Нет доступа к камере", variant: "destructive" });
    }
  }, [user, onRecorded, uploading]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!recording || !startPosRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 80) {
      cancelledRef.current = true;
      setCancelled(true);
      stopRecording();
    }
  }, [recording, stopRecording]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <>
      <div className="relative">
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onPointerMove={handlePointerMove}
          disabled={uploading}
          className={`p-2 rounded-lg transition-colors touch-target select-none ${
            recording ? "bg-destructive/20 text-destructive" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          } ${className || ""}`}
          title="Зажмите для записи видео"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Video className={`w-5 h-5 ${recording ? "animate-pulse" : ""}`} />
          )}
        </button>
        {recording && !cancelled && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-destructive/90 text-destructive-foreground text-xs font-mono">
            🔴 {formatDuration(duration)}
          </div>
        )}
      </div>

      {recording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-64 h-64 rounded-full object-cover border-4 border-primary neon-glow"
                style={{ aspectRatio: "1/1" }}
              />
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-full border-4 border-primary/50 animate-ping" />
            </div>
            <p className="text-sm text-muted-foreground">
              {cancelled ? "❌ Отменено" : `🔴 ${formatDuration(duration)} — Отпустите для отправки`}
            </p>
            <p className="text-xs text-muted-foreground">← Сдвиньте палец чтобы отменить</p>
          </div>
        </div>
      )}
    </>
  );
}
