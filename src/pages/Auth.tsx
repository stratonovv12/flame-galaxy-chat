import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { GlassCard } from "@/components/ui/GlassCard";
import { Flame, Mail, Lock, Eye, EyeOff, Globe, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgot, setShowForgot] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, isBanned } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();

  // Check for password recovery token in URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setShowReset(true);
      setShowForgot(false);
      setIsLogin(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: t("error"), description: t("fillAllFields"), variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: t("error"), description: t("passwordMinLength"), variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message === "ACCOUNT_BANNED") return;
          if (error.message.includes("Invalid login")) {
            toast({ title: t("loginError"), description: t("wrongCredentials"), variant: "destructive" });
          } else if (error.message.includes("Email not confirmed")) {
            toast({ title: t("emailNotConfirmed"), description: t("checkEmailConfirm"), variant: "destructive" });
          } else {
            toast({ title: t("error"), description: error.message, variant: "destructive" });
          }
        } else {
          navigate("/");
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes("already registered")) {
            toast({ title: t("registerError"), description: t("alreadyRegistered"), variant: "destructive" });
          } else {
            toast({ title: t("error"), description: error.message, variant: "destructive" });
          }
        } else {
          toast({ title: t("registerSuccess"), description: t("checkEmailToConfirm") });
          setIsLogin(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: t("error"), description: t("fillAllFields"), variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth#type=recovery`,
    });
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("resetLinkSent"), description: t("resetLinkSentDesc") });
      setShowForgot(false);
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast({ title: t("error"), description: t("passwordMinLength"), variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("passwordUpdated"), description: t("passwordUpdatedDesc") });
      setShowReset(false);
      window.location.hash = "";
      navigate("/");
    }
    setLoading(false);
  };

  if (isBanned) {
    return (
      <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
        <GlassCard className="w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
            <Flame className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-destructive mb-2">{t("accountBanned")}</h1>
          <p className="text-muted-foreground">{t("accountBannedDesc")}</p>
        </GlassCard>
      </div>
    );
  }

  // Reset password view
  if (showReset) {
    return (
      <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
        <GlassCard className="w-full max-w-md p-8 relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center neon-glow mb-4">
              <Flame className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">{t("setNewPassword")}</h1>
          </div>
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="relative">
              <FlameInput type="password" placeholder={t("newPassword")} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pl-12" />
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>
            <FlameButton type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? t("loading") : t("setNewPassword")}
            </FlameButton>
          </form>
        </GlassCard>
      </div>
    );
  }

  // Forgot password view
  if (showForgot) {
    return (
      <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
        <GlassCard className="w-full max-w-md p-8 relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center neon-glow mb-4">
              <Flame className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">{t("resetPassword")}</h1>
            <p className="text-muted-foreground mt-2 text-center">{t("resetPasswordDesc")}</p>
          </div>
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div className="relative">
              <FlameInput type="email" placeholder={t("email")} value={email} onChange={e => setEmail(e.target.value)} className="pl-12" />
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>
            <FlameButton type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? t("loading") : t("resetPassword")}
            </FlameButton>
          </form>
          <div className="mt-6 text-center">
            <button type="button" onClick={() => setShowForgot(false)} className="text-primary hover:text-primary/80 transition-colors text-sm flex items-center gap-1 mx-auto">
              <ArrowLeft className="w-4 h-4" /> {t("back")}
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" />
      </div>

      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === "ru" ? "en" : "ru")}
        className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground"
      >
        <Globe className="w-4 h-4" />
        {lang === "ru" ? "EN" : "RU"}
      </button>

      <GlassCard className="w-full max-w-md p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center neon-glow mb-4">
            <Flame className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-glow">FLAME</h1>
          <p className="text-muted-foreground mt-2">{isLogin ? t("welcome") : t("createAccount")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative">
            <FlameInput type="email" placeholder={t("email")} value={email} onChange={e => setEmail(e.target.value)} className="pl-12" />
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          </div>
          <div className="relative">
            <FlameInput type={showPassword ? "text" : "password"} placeholder={t("password")} value={password} onChange={e => setPassword(e.target.value)} className="pl-12 pr-12" />
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {isLogin && (
            <div className="text-right">
              <button type="button" onClick={() => setShowForgot(true)} className="text-xs text-primary hover:text-primary/80 transition-colors">
                {t("forgotPassword")}
              </button>
            </div>
          )}

          <FlameButton type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("loading") : isLogin ? t("login") : t("register")}
          </FlameButton>
        </form>

        <div className="mt-6 text-center">
          <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-primary hover:text-primary/80 transition-colors text-sm">
            {isLogin ? t("noAccount") : t("hasAccount")}
          </button>
        </div>
      </GlassCard>
    </div>
  );
};

export default Auth;
