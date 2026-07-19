import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { Users } from "lucide-react";

interface Profile {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  mode: "followers" | "following";
  onSelectUser?: (userId: string) => void;
}

export function FollowListModal({ open, onOpenChange, userId, mode, onSelectUser }: Props) {
  const { t } = useLanguage();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const col = mode === "followers" ? "following_id" : "follower_id";
      const target = mode === "followers" ? "follower_id" : "following_id";
      const { data: rels } = await supabase.from("user_follows").select(target).eq(col, userId);
      const ids = (rels || []).map((r: any) => r[target]).filter(Boolean);
      if (ids.length === 0) { setUsers([]); setLoading(false); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", ids);
      setUsers((profs as Profile[]) || []);
      setLoading(false);
    })();
  }, [open, userId, mode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md glass-card border-primary/30 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glow">
            <Users className="w-5 h-5 text-primary" />
            {mode === "followers" ? t("followers") : t("following")}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {mode === "followers" ? t("noFollowersYet") : t("noFollowingYet")}
          </p>
        ) : (
          <div className="space-y-1">
            {users.map(u => (
              <button
                key={u.user_id}
                onClick={() => { onSelectUser?.(u.user_id); onOpenChange(false); }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-primary/10 transition-colors text-left">
                <UserAvatar username={u.username} avatarUrl={u.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm truncate">{u.display_name || u.username || "—"}</p>
                    <UserBadge userId={u.user_id} />
                  </div>
                  {u.username && <p className="text-xs text-primary/70 truncate">@{u.username.replace(/^@/, "")}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
