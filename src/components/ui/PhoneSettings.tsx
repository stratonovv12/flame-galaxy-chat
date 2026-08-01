import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Switch } from "@/components/ui/switch";
import { Phone, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/** Phone attachment, SMS verification and phone privacy toggle. */
export function PhoneSettings() {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("phone, phone_verified, phone_public").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSaved((data as any).phone || null);
        setPhone((data as any).phone || "");
        setVerified(!!(data as any).phone_verified);
        setIsPublic(!!(data as any).phone_public);
      });
  }, [user]);

  const sendCode = async () => {
    if (!/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
      toast({ title: "Error", description: "Use international format, e.g. +12025550123", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone: phone.trim() });
    setBusy(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setSent(true);
    toast({ title: "Code sent", description: "Enter the SMS code to verify your number" });
  };

  const verify = async () => {
    if (!user || code.trim().length < 4) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: phone.trim(), token: code.trim(), type: "phone_change" });
    if (error) { setBusy(false); toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await supabase.from("profiles").update({ phone: phone.trim(), phone_verified: true }).eq("user_id", user.id);
    setBusy(false);
    setVerified(true); setSaved(phone.trim()); setSent(false); setCode("");
    toast({ title: "Phone verified" });
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
        <p className="font-medium text-sm">Phone number</p>
        {verified && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
      </div>

      <FlameInput placeholder="+12025550123" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" />
      {!verified || saved !== phone.trim() ? (
        sent ? (
          <div className="flex gap-2">
            <FlameInput placeholder="SMS code" value={code} onChange={e => setCode(e.target.value)} className="flex-1" inputMode="numeric" />
            <FlameButton onClick={verify} disabled={busy} size="sm">Verify</FlameButton>
          </div>
        ) : (
          <FlameButton onClick={sendCode} disabled={busy || !phone.trim()} size="sm" variant="outline" className="w-full">
            Send verification code
          </FlameButton>
        )
      ) : null}

      {verified && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Show phone on my profile</p>
          <Switch checked={isPublic} onCheckedChange={togglePublic} />
        </div>
      )}
    </div>
  );
}
