import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { GlassCard } from "@/components/ui/GlassCard";
import { Flame, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, заполните все поля",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Ошибка",
        description: "Пароль должен содержать минимум 6 символов",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("Invalid login")) {
            toast({
              title: "Ошибка входа",
              description: "Неверный email или пароль",
              variant: "destructive",
            });
          } else if (error.message.includes("Email not confirmed")) {
            toast({
              title: "Email не подтверждён",
              description: "Проверьте почту и подтвердите регистрацию",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Ошибка",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          navigate("/");
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              title: "Ошибка регистрации",
              description: "Этот email уже зарегистрирован",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Ошибка",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Успешная регистрация!",
            description: "Проверьте почту для подтверждения аккаунта",
          });
          setIsLogin(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" />
      </div>

      <GlassCard className="w-full max-w-md p-8 relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center neon-glow mb-4">
            <Flame className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-glow">FLAME</h1>
          <p className="text-muted-foreground mt-2">
            {isLogin ? "Добро пожаловать!" : "Создайте аккаунт"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative">
            <FlameInput
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-12"
            />
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          </div>

          <div className="relative">
            <FlameInput
              type={showPassword ? "text" : "password"}
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-12 pr-12"
            />
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>

          <FlameButton
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading}
          >
            {loading ? "Загрузка..." : isLogin ? "Войти" : "Зарегистрироваться"}
          </FlameButton>
        </form>

        {/* Toggle */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:text-primary/80 transition-colors text-sm"
          >
            {isLogin ? "Нет аккаунта? Зарегистрируйтесь" : "Уже есть аккаунт? Войдите"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
};

export default Auth;
