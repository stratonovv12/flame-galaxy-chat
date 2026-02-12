import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Mic } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, durationSec: number) => void;
  className?: string;
}

export function VoiceRecorder({ onRecorded, className }: VoiceRecorderProps) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const cancelledRef = useRef(false);
  const durationRef = useRef(0);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startRecording = useCallback(async (e: React.PointerEvent) => {
    if (!user) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    cancelledRef.current = false;
    setCancelled(false);
    durationRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const finalDuration = durationRef.current;
        setDuration(0);

        if (cancelledRef.current) { setCancelled(false); return; }

        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        if (blob.size < 500) return;

        onRecorded(blob, finalDuration);
      };

      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(prev => prev + 1);
      }, 1000);
    } catch {
      toast({ title: "Ошибка", description: "Нет доступа к микрофону", variant: "destructive" });
    }
  }, [user, onRecorded]);

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
    <div className="relative">
      <button
        onPointerDown={startRecording}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        onPointerMove={handlePointerMove}
        className={`p-2 rounded-lg transition-colors touch-target select-none ${
          recording ? "bg-destructive/20 text-destructive" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
        } ${className || ""}`}
        title="Зажмите для записи"
      >
        <Mic className={`w-5 h-5 ${recording ? "animate-pulse" : ""}`} />
      </button>
      {recording && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-destructive/90 text-destructive-foreground text-xs font-mono">
          {cancelled ? "❌ Отменено" : `🔴 ${formatDuration(duration)}`}
        </div>
      )}
    </div>
  );
}
