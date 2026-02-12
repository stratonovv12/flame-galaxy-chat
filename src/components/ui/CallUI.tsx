import { useState, useEffect } from "react";
import { Phone, PhoneOff, Mic, MicOff, VideoIcon, VideoOff } from "lucide-react";
import { UserAvatar } from "./UserAvatar";

interface CallUIProps {
  partnerUsername: string | null;
  partnerAvatarUrl: string | null;
  onEnd: () => void;
  isActive?: boolean;
}

export function CallUI({ partnerUsername, partnerAvatarUrl, onEnd, isActive = false }: CallUIProps) {
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [connected, setConnected] = useState(isActive);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isActive) {
      setConnected(true);
    } else {
      const timer = setTimeout(() => setConnected(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-lg">
      <div className="flex flex-col items-center gap-6">
        <div className={`${!connected ? "animate-pulse" : ""}`}>
          <UserAvatar username={partnerUsername} avatarUrl={partnerAvatarUrl} size="xl" className="neon-glow" />
        </div>
        <h2 className="text-xl font-bold">{partnerUsername || "Пользователь"}</h2>
        <p className="text-sm text-muted-foreground">
          {connected ? formatTime(elapsed) : "Вызов..."}
        </p>
      </div>

      <div className="flex items-center gap-6 mt-16">
        <button onClick={() => setMuted(!muted)} className={`p-4 rounded-full transition-colors ${muted ? "bg-destructive/20 text-destructive" : "bg-muted/30 text-foreground hover:bg-muted/50"}`}>
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        <button onClick={onEnd} className="p-5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
          <PhoneOff className="w-7 h-7" />
        </button>
        <button onClick={() => setCameraOn(!cameraOn)} className={`p-4 rounded-full transition-colors ${!cameraOn ? "bg-destructive/20 text-destructive" : "bg-muted/30 text-foreground hover:bg-muted/50"}`}>
          {cameraOn ? <VideoIcon className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}
