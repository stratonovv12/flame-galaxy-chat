import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DockContact { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; online: boolean; }

export function useDockContacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<DockContact[]>([]);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) { setContacts([]); setUnread(0); return; }
    let cancelled = false;
    const load = async () => {
      const [following, deleted, blocked, messages] = await Promise.all([
        supabase.from("user_follows").select("following_id").eq("follower_id", user.id),
        supabase.from("deleted_conversations").select("partner_id").eq("user_id", user.id),
        supabase.from("blocked_users").select("blocked_id").eq("blocker_id", user.id),
        supabase.from("direct_messages").select("sender_id").eq("receiver_id", user.id).is("read_at", null),
      ]);
      const hidden = new Set([...(deleted.data ?? []).map(d => d.partner_id), ...(blocked.data ?? []).map(b => b.blocked_id)]);
      const ids = (following.data ?? []).map(f => f.following_id).filter(id => id !== user.id && !hidden.has(id));
      const unreadSenders = new Set((messages.data ?? []).map(m => m.sender_id).filter(id => !hidden.has(id)));
      if (!cancelled) setUnread(unreadSenders.size);
      if (!ids.length) { if (!cancelled) setContacts([]); return; }
      const [profiles, presence] = await Promise.all([
        supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", ids),
        supabase.from("user_presence").select("user_id, is_online, last_seen").in("user_id", ids),
      ]);
      const online = new Set((presence.data ?? []).filter(p => p.is_online && Date.now() - new Date(p.last_seen).getTime() < 300_000).map(p => p.user_id));
      if (!cancelled) setContacts((profiles.data ?? []).map(p => ({ ...p, online: online.has(p.user_id) })));
    };
    void load();
    const channel = supabase.channel(`dock-${user.id}-${crypto.randomUUID()}`);
    for (const table of ["user_follows", "deleted_conversations", "blocked_users", "direct_messages", "user_presence", "profiles"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => void load());
    }
    channel.subscribe();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; clearInterval(timer); void supabase.removeChannel(channel); };
  }, [user?.id]);
  return { contacts, unread };
}