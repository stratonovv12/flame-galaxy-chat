import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";
import { toast } from "@/hooks/use-toast";
import { CallUI } from "@/components/ui/CallUI";
import { IncomingCallUI } from "@/components/ui/IncomingCallUI";
import { canStartTimer, setAudioMuted, type CallPhase } from "@/lib/call-state";
import type { Tables } from "@/integrations/supabase/types";

type Call = Tables<"calls">;
interface CallPartner { id: string; username: string | null; avatarUrl: string | null; }
interface CallingApi { startCall: (partner: CallPartner, video?: boolean) => Promise<void>; }
const CallingContext = createContext<CallingApi | null>(null);

export function CallingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [partner, setPartner] = useState<CallPartner | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [video, setVideo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const callRef = useRef<Call | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const acceptedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const seenIce = useRef(new Set<string>());
  const answered = useRef(false);
  const creating = useRef(false);
  const generation = useRef(0);

  const cleanup = useCallback(() => {
    generation.current++;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) { pc.onconnectionstatechange = null; pc.onicecandidate = null; pc.ontrack = null; pc.close(); }
    localRef.current?.getTracks().forEach(track => track.stop());
    localRef.current = null;
    callRef.current = null;
    acceptedRef.current = false;
    pendingIce.current = [];
    seenIce.current.clear();
    answered.current = false;
    creating.current = false;
    setLocal(null); setRemote(null); setPhase("idle"); setConnectedAt(null); setPartner(null); setMuted(false);
  }, []);

  const finish = useCallback(async (status = "ended") => {
    const call = callRef.current;
    cleanup();
    if (call) await supabase.from("calls").update({ status, ended_at: new Date().toISOString() }).eq("id", call.id).in("status", ["ringing", "active"]);
  }, [cleanup]);

  const addIce = async (candidate: Tables<"call_ice_candidates">) => {
    if (candidate.call_id !== callRef.current?.id || candidate.user_id === user?.id || seenIce.current.has(candidate.id)) return;
    seenIce.current.add(candidate.id);
    const ice = candidate.candidate as unknown as RTCIceCandidateInit;
    if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(ice);
    else pendingIce.current.push(ice);
  };
  const flushIce = async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    for (const ice of pendingIce.current.splice(0)) await pc.addIceCandidate(ice);
    const call = callRef.current;
    if (!call) return;
    const { data } = await supabase.from("call_ice_candidates").select("*").eq("call_id", call.id);
    for (const candidate of data ?? []) await addIce(candidate);
  };

  const createPeer = async (withVideo: boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("mediaPermissionError"));
    const attempt = generation.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: withVideo ? { facingMode: "user" } : false });
    if (attempt !== generation.current) { stream.getTracks().forEach(track => track.stop()); throw new Error(t("callEnded")); }
    localRef.current = stream; setLocal(stream); setVideo(withVideo); setCameraOn(withVideo);
    const iceServers: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
    // Optional short-lived TURN credentials supplied by a configured relay function.
    if (import.meta.env.VITE_CALL_RELAY_ENABLED === "true") {
      const { data, error } = await supabase.functions.invoke("call-relay");
      if (error) throw error;
      if (Array.isArray(data?.iceServers)) iceServers.push(...data.iceServers);
    }
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    const remoteStream = new MediaStream();
    setRemote(remoteStream);
    pc.ontrack = event => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of tracks) if (!remoteStream.getTracks().some(t => t.id === track.id)) remoteStream.addTrack(track);
      setRemote(new MediaStream(remoteStream.getTracks()));
    };
    pc.onicecandidate = event => {
      const call = callRef.current;
      if (event.candidate && call && user) {
        void supabase.from("call_ice_candidates").insert({ call_id: call.id, user_id: user.id, candidate: event.candidate.toJSON() as unknown as Tables<"call_ice_candidates">["candidate"] }).then(({ error }) => { if (error) void finish(); });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      if (canStartTimer(acceptedRef.current, pc.connectionState)) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setPhase("connected"); setConnectedAt(previous => previous ?? Date.now());
        const call = callRef.current;
        if (call && !call.started_at) void supabase.from("calls").update({ started_at: new Date().toISOString() }).eq("id", call.id);
      } else if (pc.connectionState === "failed") {
        toast({ title: t("callFailed"), description: t("callNetworkError"), variant: "destructive" });
        void finish();
      } else if (pc.connectionState === "disconnected") {
        setPhase("connecting");
        timeoutRef.current = setTimeout(() => void finish(), 15_000);
      }
    };
    return pc;
  };

  const accept = async () => {
    const call = callRef.current;
    if (!call?.offer || !user) return;
    setPhase("connecting");
    try {
      const { data: current } = await supabase.from("calls").select("status").eq("id", call.id).single();
      if (current?.status !== "ringing") { cleanup(); return; }
      const pc = await createPeer(call.call_type === "video");
      if (callRef.current?.id !== call.id) { cleanup(); return; }
      await pc.setRemoteDescription(call.offer as unknown as RTCSessionDescriptionInit);
      await flushIce();
      const answer = await pc.createAnswer();
      acceptedRef.current = true;
      await pc.setLocalDescription(answer);
      const { data, error } = await supabase.from("calls").update({ status: "active", answer: { type: answer.type, sdp: answer.sdp } }).eq("id", call.id).eq("status", "ringing").select().single();
      if (error) throw error;
      callRef.current = data;
      timeoutRef.current = setTimeout(() => void finish(), 30_000);
    } catch (error) {
      toast({ title: t("callFailed"), description: error instanceof Error ? error.message : t("mediaPermissionError"), variant: "destructive" });
      await finish("rejected");
    }
  };

  const receive = async (call: Call) => {
    if (!user) return;
    if (callRef.current && callRef.current.id !== call.id) {
      if (call.receiver_id === user.id && call.status === "ringing") await supabase.from("calls").update({ status: "rejected", ended_at: new Date().toISOString() }).eq("id", call.id);
      return;
    }
    if (["ended", "missed", "rejected"].includes(call.status)) {
      if (callRef.current?.id === call.id) { toast({ title: call.status === "rejected" ? t("callDeclined") : t("callEnded") }); cleanup(); }
      return;
    }
    if (!callRef.current && call.receiver_id === user.id && call.status === "ringing") {
      if (Date.now() - new Date(call.created_at).getTime() > 45_000) return;
      callRef.current = call;
      const { data } = await supabase.from("profiles").select("username, display_name, avatar_url").eq("user_id", call.caller_id).maybeSingle();
      if (callRef.current?.id !== call.id) return;
      setPartner({ id: call.caller_id, username: data?.display_name || data?.username || null, avatarUrl: data?.avatar_url || null });
      setVideo(call.call_type === "video"); setPhase("incoming");
      timeoutRef.current = setTimeout(() => void finish("missed"), Math.max(0, 45_000 - (Date.now() - new Date(call.created_at).getTime())));
    } else if (callRef.current?.id === call.id) {
      callRef.current = call;
      if (call.caller_id === user.id && call.answer && pcRef.current && !answered.current) {
        answered.current = true; acceptedRef.current = true; setPhase("connecting");
        await pcRef.current.setRemoteDescription(call.answer as unknown as RTCSessionDescriptionInit);
        await flushIce();
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const refresh = async () => {
      const current = callRef.current;
      if (current) {
        const { data } = await supabase.from("calls").select("*").eq("id", current.id).maybeSingle();
        if (data && !stopped) await receive(data);
        const { data: ice } = await supabase.from("call_ice_candidates").select("*").eq("call_id", current.id);
        for (const candidate of ice ?? []) if (!stopped) await addIce(candidate);
      } else {
        const { data } = await supabase.from("calls").select("*").eq("receiver_id", user.id).eq("status", "ringing").gte("created_at", new Date(Date.now() - 45_000).toISOString()).order("created_at", { ascending: false }).limit(1);
        if (data?.[0] && !stopped) await receive(data[0]);
      }
    };
    const channel = supabase.channel(`calling-${user.id}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, payload => { if (payload.eventType !== "DELETE") void receive(payload.new as Call).catch(() => void finish()); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_ice_candidates" }, payload => void addIce(payload.new as Tables<"call_ice_candidates">).catch(() => void finish()))
      .subscribe(status => { if (status === "SUBSCRIBED") void refresh(); });
    // Recovery polling covers reconnects and missed signaling events.
    const timer = setInterval(() => void refresh().catch(() => {}), 2500);
    return () => { stopped = true; clearInterval(timer); void supabase.removeChannel(channel); const call = callRef.current; if (call) void supabase.from("calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", call.id); cleanup(); };
  }, [user?.id]);

  const startCall = async (contact: CallPartner, withVideo = false) => {
    if (!user || callRef.current || creating.current) return;
    creating.current = true; setPartner(contact); setPhase("acquiring");
    try {
      const pc = await createPeer(withVideo);
      const offer = await pc.createOffer();
      const { data, error } = await supabase.from("calls").insert({ caller_id: user.id, receiver_id: contact.id, status: "ringing", call_type: withVideo ? "video" : "audio", offer: { type: offer.type, sdp: offer.sdp } }).select().single();
      if (error) throw error;
      callRef.current = data;
      await pc.setLocalDescription(offer); setPhase("ringing");
      timeoutRef.current = setTimeout(async () => {
        if (callRef.current?.id !== data.id || acceptedRef.current) return;
        await finish("missed");
        await supabase.from("direct_messages").insert({ sender_id: user.id, receiver_id: contact.id, content: `📞 ${t("missedCall")}` });
      }, 45_000);
    } catch (error) {
      toast({ title: t("callFailed"), description: error instanceof Error ? error.message : t("mediaPermissionError"), variant: "destructive" });
      await finish();
    }
  };

  const toggleMute = () => { const next = !muted; setAudioMuted(localRef.current, next); setMuted(next); };
  const toggleCamera = async () => {
    const stream = localRef.current;
    const pc = pcRef.current;
    if (!stream || !pc) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length) { tracks.forEach(track => { track.enabled = !cameraOn; }); setCameraOn(!cameraOn); }
  };
  return <CallingContext.Provider value={{ startCall }}>
    {children}
    {phase === "incoming" && partner ? <IncomingCallUI callerUsername={partner.username} callerAvatarUrl={partner.avatarUrl} onAccept={() => void accept()} onReject={() => void finish("rejected")} video={video} /> : phase !== "idle" && partner && <CallUI partnerUsername={partner.username} partnerAvatarUrl={partner.avatarUrl} onEnd={() => void finish()} phase={phase} connectedAt={connectedAt} localStream={local} remoteStream={remote} video={video} muted={muted} cameraOn={cameraOn} onToggleMute={toggleMute} onToggleCamera={() => void toggleCamera()} />}
  </CallingContext.Provider>;
}
export function useCalling() {
  const context = useContext(CallingContext);
  if (!context) throw new Error("Calling provider is required");
  return context;
}