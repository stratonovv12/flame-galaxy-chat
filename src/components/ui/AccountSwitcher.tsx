import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { FlameButton } from "@/components/ui/FlameButton";
import { Plus, Check, Trash2, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STORE_KEY = "flame_accounts";

interface StoredAccount {
  userId: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  refreshToken: string;
  accessToken: string;
}

const readStore = (): StoredAccount[] => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
};
const writeStore = (list: StoredAccount[]) => localStorage.setItem(STORE_KEY, JSON.stringify(list));

/** Telegram-style multi-account switcher: keeps sessions locally and swaps them in one tap. */
export function AccountSwitcher() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<StoredAccount[]>(readStore());

  // Persist the currently active session so it can be restored later.
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!s?.refresh_token) return;
      const { data: profile } = await supabase.from("profiles")
        .select("username, avatar_url").eq("user_id", user.id).maybeSingle();
      const entry: StoredAccount = {
        userId: user.id,
        email: user.email ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        refreshToken: s.refresh_token,
        accessToken: s.access_token,
      };
      const next = [entry, ...readStore().filter(a => a.userId !== user.id)];
      writeStore(next);
      setAccounts(next);
    })();
  }, [user]);

  const switchTo = async (acc: StoredAccount) => {
    if (acc.userId === user?.id) return;
    const { error } = await supabase.auth.setSession({
      access_token: acc.accessToken,
      refresh_token: acc.refreshToken,
    });
    if (error) {
      toast({ title: t("error"), description: t("sessionExpiredSignInAgain"), variant: "destructive" });
      const next = readStore().filter(a => a.userId !== acc.userId);
      writeStore(next); setAccounts(next);
      return;
    }
    window.location.reload();
  };

  const remove = (acc: StoredAccount) => {
    const next = readStore().filter(a => a.userId !== acc.userId);
    writeStore(next); setAccounts(next);
  };

  const addAccount = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-muted-foreground" />
        <p className="font-medium text-sm">{t("accounts")}</p>
      </div>
      {accounts.map(acc => {
        const active = acc.userId === user?.id;
        return (
          <div key={acc.userId}
            className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${active ? "border-primary/50 bg-primary/10" : "border-border bg-muted/20 hover:bg-muted/40"}`}>
            <button onClick={() => switchTo(acc)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <UserAvatar username={acc.username} avatarUrl={acc.avatarUrl} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{acc.username ? `@${acc.username}` : acc.email}</p>
                <p className="text-xs text-muted-foreground truncate">{acc.email}</p>
              </div>
            </button>
            {active ? <Check className="w-4 h-4 text-primary shrink-0" /> : (
              <button onClick={() => remove(acc)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
      <FlameButton variant="outline" className="w-full" onClick={addAccount}>
        <Plus className="w-4 h-4 mr-2" />{t("addAccount")}
      </FlameButton>
    </div>
  );
}
