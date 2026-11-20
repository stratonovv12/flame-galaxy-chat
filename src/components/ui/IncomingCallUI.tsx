import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./button";
import { useLanguage } from "@/contexts/LanguageContext";
interface Props { callerUsername: string | null; callerAvatarUrl: string | null; onAccept: () => void; onReject: () => void; video?: boolean; }
export function IncomingCallUI({ callerUsername, callerAvatarUrl, onAccept, onReject, video }: Props) {
  const { t } = useLanguage();
  useEffect(() => {
    const context = new AudioContext();
    const ring = () => {
      if (context.state !== "running") return;
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.frequency.value = 440; gain.gain.value = 0.05;
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.4);
    };
    ring(); const timer = setInterval(ring, 2000);
    return () => { clearInterval(timer); void context.close(); };
  }, []);
  return <div role="dialog" aria-modal="true" aria-label={t("incomingCall")} className="fixed inset-0 z-[150] bg-background flex flex-col items-center justify-center gap-5">
    <UserAvatar username={callerUsername} avatarUrl={callerAvatarUrl} size="xl" />
    <h2 className="text-xl font-semibold">{callerUsername || t("user")}</h2>
    <p className="text-muted-foreground">{video ? t("incomingVideoCall") : t("incomingCall")}</p>
    <div className="flex gap-8 mt-12">
      <Button size="icon" variant="destructive" className="w-14 h-14 rounded-full" onClick={onReject} aria-label={t("declineCall")}><PhoneOff /></Button>
      <Button size="icon" className="w-14 h-14 rounded-full bg-success text-primary-foreground hover:bg-success/90" onClick={onAccept} aria-label={t("acceptCall")}>{video ? <Video /> : <Phone />}</Button>
    </div>
  </div>;
}
