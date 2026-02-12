import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceData {
  is_online: boolean;
  last_seen: string | null;
}

export function useOnlineStatus(userId: string | undefined | null): PresenceData {
  const [data, setData] = useState<PresenceData>({ is_online: false, last_seen: null });

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      const { data: p } = await supabase
        .from("user_presence")
        .select("is_online, last_seen")
        .eq("user_id", userId)
        .maybeSingle();
      if (p) {
        // Consider online if last_seen within 5 min
        const lastSeen = new Date(p.last_seen);
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        setData({ is_online: p.is_online && lastSeen > fiveMinAgo, last_seen: p.last_seen });
      }
    };
    fetch();
  }, [userId]);

  return data;
}
