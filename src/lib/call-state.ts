export type CallPhase = "idle" | "acquiring" | "calling" | "ringing" | "incoming" | "connecting" | "connected" | "ended";
export function callDuration(phase: CallPhase, connectedAt: number | null, now: number): number {
  return phase === "connected" && connectedAt !== null ? Math.max(0, Math.floor((now - connectedAt) / 1000)) : 0;
}
export function canStartTimer(accepted: boolean, connection: RTCPeerConnectionState): boolean {
  return accepted && connection === "connected";
}
export function setAudioMuted(stream: Pick<MediaStream, "getAudioTracks"> | null, muted: boolean) {
  stream?.getAudioTracks().forEach(track => { track.enabled = !muted; });
}