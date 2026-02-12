import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Video } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VideoCircleRecorderProps {
  onRecorded: (blob: Blob, durationSec: number, thumbnailUrl: string) => void;
  className?: string;
}

const MAX_DURATION = 30;

export function VideoCircleRecorder({ onRecorded, className }: VideoCircleRecorderProps) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const cancelledRef = useRef(false);
  const durationRef = useRef(0);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const captureThumbnail = useCallback((): string => {
    if (!videoRef.current) return "";
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 120;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      const v = videoRef.current;
      const size = Math.min(v.videoWidth, v.videoHeight);
      const sx = (v.videoWidth - size) / 2;
      const sy = (v.videoHeight - size) / 2;
      ctx.drawImage(v, sx, sy, size, size, 0, 0, 120, 120);
      return canvas.toDataURL("image/jpeg", 0.5);
    } catch {
      return "";
    }
  }, []);

  const startRecording = useCallback(async (e: React.PointerEvent) => {
    if (!user) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    cancelledRef.current = false;
    setCancelled(false);
    durationRef.current = 0;

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

      mediaRecorder.onstop = () => {
        const thumbnail = captureThumbnail();
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const finalDuration = durationRef.current;
        setDuration(0);

        if (cancelledRef.current) { setCancelled(false); return; }

        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "video/webm" });
        if (blob.size < 1000) return;

        onRecorded(blob, finalDuration, thumbnail);
      };

      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(prev => {
          if (prev >= MAX_DURATION - 1) { stopRecording(); return 0; }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast({ title: "Ошибка", description: "Нет доступа к камере", variant: "destructive" });
    }
  }, [user, onRecorded, captureThumbnail]);

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

  const progressPct = (duration / MAX_DURATION) * 100;
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (circumference * progressPct) / 100;

  return (
    <>
      {/* Record button with circular progress */}
      <div className="relative">
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onPointerMove={handlePointerMove}
          className={`relative p-2 rounded-lg transition-colors touch-target select-none ${
            recording ? "bg-destructive/20 text-destructive" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          } ${className || ""}`}
          title="Зажмите для записи видео"
        >
          <Video className={`w-5 h-5 ${recording ? "animate-pulse" : ""}`} />
          {recording && (
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" strokeWidth="2.5"
                className="stroke-destructive/30" />
              <circle cx="20" cy="20" r="18" fill="none" strokeWidth="2.5"
                className="stroke-destructive transition-all duration-1000"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset} />
            </svg>
          )}
        </button>
      </div>

      {/* Centered fullscreen camera preview overlay */}
      {recording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {/* Red glow ring */}
              <div className="absolute -inset-2 rounded-full bg-destructive/20 blur-lg animate-pulse" />
              {/* Circular progress ring around video */}
              <svg className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] -rotate-90 pointer-events-none" viewBox="0 0 108 108">
                <circle cx="54" cy="54" r="52" fill="none" strokeWidth="3"
                  stroke="hsl(var(--destructive) / 0.2)" />
                <circle cx="54" cy="54" r="52" fill="none" strokeWidth="3"
                  stroke="hsl(var(--destructive))"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={2 * Math.PI * 52 - (2 * Math.PI * 52 * progressPct) / 100}
                  className="transition-all duration-1000" />
              </svg>
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-64 h-64 rounded-full object-cover border-4 border-destructive shadow-[0_0_40px_hsl(var(--destructive)/0.4)]"
                style={{ aspectRatio: "1/1" }}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-destructive">
                {cancelled ? "❌ Отменено" : `🔴 REC ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Отпустите для отправки · Сдвиньте чтобы отменить
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
