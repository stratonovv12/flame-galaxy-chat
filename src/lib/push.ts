import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

let _registered = false;
export async function registerServiceWorker() {
  if (_registered) return;
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Skip in Lovable preview iframes to avoid editor breakage
  try {
    if (window !== window.top) return;
  } catch {}
  try {
    await navigator.serviceWorker.register("/sw.js");
    _registered = true;
  } catch (e) {
    console.warn("SW register failed", e);
  }
}

export async function ensurePushSubscription(userId: string) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data, error } = await supabase.functions.invoke("vapid-public-key");
      if (error || !data?.key) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
    }
    const json = sub.toJSON() as any;
    const endpoint = json.endpoint as string;
    const p256dh = json.keys?.p256dh as string;
    const auth = json.keys?.auth as string;
    if (!endpoint || !p256dh || !auth) return;
    // Upsert by endpoint
    await supabase.from("push_subscriptions")
      .upsert({ user_id: userId, endpoint, p256dh, auth }, { onConflict: "endpoint" });
  } catch (e) {
    console.warn("push subscribe failed", e);
  }
}

export async function sendPush(receiverId: string, title: string, body: string, url = "/") {
  try {
    await supabase.functions.invoke("send-push", {
      body: { receiverId, title, body, url, tag: `msg-${receiverId}` },
    });
  } catch {}
}
