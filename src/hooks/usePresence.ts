import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function usePresence() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const updatePresence = useCallback(async () => {
    if (!user) return;
    await supabase.from("user_presence").upsert(
      { user_id: user.id, last_seen: new Date().toISOString(), is_online: true },
      { onConflict: "user_id" }
    );
  }, [user]);

  const setOffline = useCallback(async () => {
    if (!user) return;
    await supabase.from("user_presence").upsert(
      { user_id: user.id, last_seen: new Date().toISOString(), is_online: false },
      { onConflict: "user_id" }
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    updatePresence();
    intervalRef.current = setInterval(updatePresence, 60_000); // every minute

    const handleVisibility = () => {
      if (document.hidden) setOffline();
      else updatePresence();
    };
    const handleBeforeUnload = () => setOffline();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      setOffline();
    };
  }, [user, updatePresence, setOffline]);
}
