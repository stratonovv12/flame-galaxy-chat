import { GlassCard } from "@/components/ui/GlassCard";
import { Flame } from "lucide-react";

const Banned = () => {
  return (
    <div className="min-h-screen cosmic-bg flex items-center justify-center p-4">
      <GlassCard className="w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
          <Flame className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-destructive mb-2">Аккаунт заблокирован</h1>
        <p className="text-muted-foreground">
          Ваш аккаунт был заблокирован администратором. Если вы считаете, что это ошибка, обратитесь в поддержку.
        </p>
      </GlassCard>
    </div>
  );
};

export default Banned;
