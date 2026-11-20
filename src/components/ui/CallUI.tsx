import { useEffect, useRef, useState } from "react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Volume2 } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./button";
import { useLanguage } from "@/contexts/LanguageContext";
import { callDuration, type CallPhase } from "@/lib/call-state";

interface CallUIProps {
  partnerUsername: string | null; partnerAvatarUrl: string | null; onEnd: () => void;
  phase: CallPhase; connectedAt: number | null; localStream: MediaStream | null; remoteStream: MediaStream | null;
  video: boolean; muted: boolean; cameraOn: boolean; onToggleMute: () => void; onToggleCamera: () => void;
}
export function CallUI({ partnerUsername, partnerAvatarUrl, onEnd, phase, connectedAt, localStream, remoteStream, video, muted, cameraOn, onToggleMute, onToggleCamera }: CallUIProps) {
  const { t } = useLanguage();
  const [now, setNow] = useState(Date.now());
  const [playBlocked, setPlayBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (phase !== "connected") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    const audio = audioRef.current;
    const remote = remoteRef.current;
    if (audio) { audio.srcObject = remoteStream; if (remoteStream) void audio.play().catch(() => setPlayBlocked(true)); }
    if (remote) { remote.srcObject = remoteStream; void remote.play().catch(() => {}); }
  }, [remoteStream, video]);
  useEffect(() => { if (localRef.current) localRef.current.srcObject = localStream; }, [localStream, video]);
  const seconds = callDuration(phase, connectedAt, now);
  const timer = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return <div role="dialog" aria-modal="true" aria-label={video ? t("videoCall") : t("call")} className="fixed inset-0 z-[150] bg-background flex flex-col items-center justify-center overflow-hidden">
    <audio ref={audioRef} autoPlay playsInline />
    {video && <video ref={remoteRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />}
    <div className="relative flex flex-col items-center gap-4 p-6 bg-background/70 rounded-lg">
      <UserAvatar username={partnerUsername} avatarUrl={partnerAvatarUrl} size="xl" />
      <h2 className="text-xl font-semibold">{partnerUsername || t("user")}</h2>
      <p role="status" className="text-sm text-muted-foreground tabular-nums">{phase === "connected" ? timer : phase === "connecting" ? t("callConnecting") : phase === "ringing" ? t("callRinging") : t("calling")}</p>
      {playBlocked && <Button variant="outline" onClick={() => { void audioRef.current?.play().then(() => setPlayBlocked(false)); }}><Volume2 />{t("enableCallAudio")}</Button>}
    </div>
    {video && <video ref={localRef} autoPlay playsInline muted className={`absolute top-6 right-4 w-28 aspect-[3/4] rounded-lg object-cover border border-border bg-card ${cameraOn ? "" : "invisible"}`} />}
    <div className="absolute bottom-10 flex items-center gap-4 p-3 rounded-full bg-card/90 border border-border">
      <Button size="icon" variant={muted ? "destructive" : "secondary"} className="rounded-full h-12 w-12" onClick={onToggleMute} aria-label={muted ? t("unmute") : t("mute")} aria-pressed={muted}>{muted ? <MicOff /> : <Mic />}</Button>
      <Button size="icon" variant="destructive" className="rounded-full h-14 w-14" onClick={onEnd} aria-label={t("endCall")}><PhoneOff /></Button>
      {video && <Button size="icon" variant={cameraOn ? "secondary" : "destructive"} className="rounded-full h-12 w-12" onClick={onToggleCamera} aria-label={t("toggleCamera")} aria-pressed={cameraOn}>{cameraOn ? <Video /> : <VideoOff />}</Button>}
    </div>
  </div>;
}
