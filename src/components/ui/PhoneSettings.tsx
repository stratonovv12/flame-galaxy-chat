import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Switch } from "@/components/ui/switch";
import { Phone, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/** Phone attachment (saved instantly, no SMS step) and phone privacy toggle. */
export function PhoneSettings() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("phone, phone_public").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSaved((data as any).phone || null);
        setPhone((data as any).phone || "");
        setIsPublic(!!(data as any).phone_public);
      });
  }, [user]);

  const savePhone = async () => {
    if (!user) return;
    const value = phone.trim();
    if (!/^\+[1-9]\d{6,14}$/.test(value)) {
      toast({ title: t("error"), description: "Use international format, e.g. +12025550123", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ phone: value, phone_verified: true })
      .eq("user_id", user.id);
    setBusy(false);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    setSaved(value);
    toast({ title: t("phoneSaved") });
  };

  const togglePublic = async (v: boolean) => {
    if (!user) return;
    setIsPublic(v);
    await supabase.from("profiles").update({ phone_public: v }).eq("user_id", user.id);
  };

  return (
    <div className="py-2 space-y-3">
      <div className="flex items-center gap-2">
        <Phone className="w-4 h-4 text-muted-foreground" />
        <p className="font-medium text-sm">{t("phoneNumber")}</p>
        {saved && saved === phone.trim() && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
      </div>

      <FlameInput placeholder="+12025550123" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" />
      {saved !== phone.trim() && (
        <FlameButton onClick={savePhone} disabled={busy || !phone.trim()} size="sm" variant="outline" className="w-full">
          {t("save")}
        </FlameButton>
      )}

      {saved && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t("showPhoneOnProfile")}</p>
          <Switch checked={isPublic} onCheckedChange={togglePublic} />
        </div>
      )}
    </div>
  );
}
