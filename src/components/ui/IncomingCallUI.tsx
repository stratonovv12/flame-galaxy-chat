import { useEffect, useRef } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { UserAvatar } from "./UserAvatar";

interface IncomingCallUIProps {
  callerUsername: string | null;
  callerAvatarUrl: string | null;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallUI({ callerUsername, callerAvatarUrl, onAccept, onReject }: IncomingCallUIProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Play ringtone
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
    audio.loop = true;
    audio.volume = 0.7;
    audio.play().catch(() => {});
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-lg">
      <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="animate-pulse">
          <UserAvatar username={callerUsername} avatarUrl={callerAvatarUrl} size="xl" className="neon-glow" />
        </div>
        <h2 className="text-xl font-bold">{callerUsername || "Пользователь"}</h2>
        <p className="text-sm text-muted-foreground animate-pulse">Входящий вызов...</p>
      </div>

      <div className="flex items-center gap-12 mt-16">
        <button
          onClick={onReject}
          className="p-5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all shadow-[0_0_20px_hsl(var(--destructive)/0.4)]"
        >
          <PhoneOff className="w-7 h-7" />
        </button>
        <button
          onClick={onAccept}
          className="p-5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-all shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-bounce"
        >
          <Phone className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
