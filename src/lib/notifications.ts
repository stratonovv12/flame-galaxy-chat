// Notification sound + smart contextual logic
let audioCtx: AudioContext | null = null;

// Track the currently open chat partner so we can suppress sounds while actively chatting
let _activeChatPartnerId: string | null = null;
export function setActiveChatPartner(id: string | null) {
  _activeChatPartnerId = id;
}
export function getActiveChatPartner() {
  return _activeChatPartnerId;
}

// One-shot dedupe: never play the same notification twice for the same message
const _firedIds = new Set<string>();

export function getVolume(): number {
  const v = parseFloat(localStorage.getItem("flame_volume") || "0.6");
  if (isNaN(v)) return 0.6;
  return Math.min(1, Math.max(0, v));
}
export function setVolume(v: number) {
  localStorage.setItem("flame_volume", String(v));
}

export function playNotificationSound(opts?: { messageId?: string; senderId?: string }) {
  // Suppress when actively inside the same chat
  if (opts?.senderId && opts.senderId === _activeChatPartnerId) return;
  // One notification per message
  if (opts?.messageId) {
    if (_firedIds.has(opts.messageId)) return;
    _firedIds.add(opts.messageId);
  }
  const volume = getVolume();
  if (volume <= 0) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    // Native Android-style two-tone ping
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.35 * volume, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 0.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320, now + 0.16);
    gain2.gain.setValueAtTime(0.0001, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.3 * volume, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.16); osc2.stop(now + 0.38);
  } catch {
    // Audio not available
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showBrowserNotification(title: string, body: string, opts?: { messageId?: string; senderId?: string; tag?: string }) {
  if (opts?.senderId && opts.senderId === _activeChatPartnerId) return;
  if (opts?.messageId) {
    const key = "n_" + opts.messageId;
    if (_firedIds.has(key)) return;
    _firedIds.add(key);
  }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", tag: opts?.tag || opts?.messageId, silent: false });
  } catch {
    // Notification not supported
  }
}
