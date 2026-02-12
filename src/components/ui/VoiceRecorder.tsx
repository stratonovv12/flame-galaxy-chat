import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Mic } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  onRecorded: (url: string) => void;
  className?: string;
}

export function VoiceRecorder({ onRecorded, className }: VoiceRecorderProps) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    if (!user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Find supported mimeType
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        if (blob.size < 500) return;

        setUploading(true);
        try {
          const ext = "webm";
          const filePath = `${user.id}/${Date.now()}_voice.${ext}`;
          const { error } = await supabase.storage.from("media").upload(filePath, blob, { cacheControl: "3600", upsert: true, contentType: "audio/webm" });
          if (error) throw error;
          const { data } = supabase.storage.from("media").getPublicUrl(filePath);
          if (data?.publicUrl) onRecorded(data.publicUrl);
        } catch (err: any) {
          toast({ title: "Ошибка", description: err.message, variant: "destructive" });
        } finally {
          setUploading(false);
        }
      };

      mediaRecorder.start(100); // collect data every 100ms
      setRecording(true);
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

  return (
    <button
      onPointerDown={startRecording}
      onPointerUp={stopRecording}
      onPointerLeave={stopRecording}
      disabled={uploading}
      className={`p-2 rounded-lg transition-colors touch-target ${recording ? "bg-destructive/20 text-destructive animate-pulse" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"} ${className || ""}`}
      title="Зажмите для записи"
    >
      {uploading ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Mic className="w-5 h-5" />}
    </button>
  );
}
