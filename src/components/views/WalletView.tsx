import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Copy, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const DEPOSIT_ADDRESS = "TXqZ3bR9kE7vF2dW8mL5nP1cY6aJ4sU0xH"; // Placeholder TRC-20
const MIN_DEPOSIT = 0.5;
const MIN_WITHDRAWAL = 1.0;

export function WalletView() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [mode, setMode] = useState<"main" | "deposit" | "withdraw">("main");
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchBalance();
  }, [user]);

  const fetchBalance = async () => {
    if (!user) return;
    const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    if (data) setBalance(Number(data.balance));
    else {
      await supabase.from("wallets").insert({ user_id: user.id, balance: 0 });
      setBalance(0);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(DEPOSIT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitDeposit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < MIN_DEPOSIT) {
      toast({ title: "Ошибка", description: `Минимальный депозит — $${MIN_DEPOSIT.toFixed(2)}`, variant: "destructive" });
      return;
    }
    if (!user) return;
    setLoading(true);
    await supabase.from("deposit_requests").insert({
      user_id: user.id,
      amount: num,
      type: "deposit",
    } as any);
    toast({ title: "Заявка создана", description: "Отправьте USDT на указанный адрес. Баланс обновится после подтверждения." });
    setAmount("");
    setMode("main");
    setLoading(false);
  };

  const submitWithdrawal = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < MIN_WITHDRAWAL) {
      toast({ title: "Ошибка", description: `Минимальный вывод — $${MIN_WITHDRAWAL.toFixed(2)}`, variant: "destructive" });
      return;
    }
    if (num > balance) {
      toast({ title: "Ошибка", description: "Недостаточно средств", variant: "destructive" });
      return;
    }
    if (!walletAddress.trim()) {
      toast({ title: "Ошибка", description: "Введите адрес крипто-кошелька", variant: "destructive" });
      return;
    }
    if (!user) return;
    setLoading(true);
    await supabase.from("deposit_requests").insert({
      user_id: user.id,
      amount: num,
      type: "withdrawal",
      wallet_address: walletAddress.trim(),
    } as any);
    toast({ title: "Заявка на вывод создана", description: "Средства будут отправлены в течение 24ч." });
    setAmount("");
    setWalletAddress("");
    setMode("main");
    setLoading(false);
  };

  if (mode === "deposit") {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        <button onClick={() => setMode("main")} className="text-sm text-primary hover:underline">← Назад</button>
        <h2 className="text-xl font-bold">Пополнить баланс</h2>
        <GlassCard className="p-6 space-y-4" glow>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">Адрес USDT (TRC-20)</label>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
              <code className="text-xs flex-1 break-all text-primary">{DEPOSIT_ADDRESS}</code>
              <button onClick={copyAddress} className="shrink-0 p-1.5 hover:bg-muted rounded">
                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>
          <FlameInput
            label={`Сумма (мин. $${MIN_DEPOSIT.toFixed(2)})`}
            placeholder="10.00"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <FlameButton onClick={submitDeposit} className="w-full" disabled={loading}>
            {loading ? "Отправка..." : "Создать заявку на пополнение"}
          </FlameButton>
        </GlassCard>
      </div>
    );
  }

  if (mode === "withdraw") {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        <button onClick={() => setMode("main")} className="text-sm text-primary hover:underline">← Назад</button>
        <h2 className="text-xl font-bold">Вывод средств</h2>
        <GlassCard className="p-6 space-y-4" glow>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Доступно</p>
            <p className="text-2xl font-bold text-primary">${balance.toFixed(2)}</p>
          </div>
          <FlameInput
            label="Адрес крипто-кошелька (TRC-20)"
            placeholder="TXqZ3..."
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
          />
          <FlameInput
            label={`Сумма (мин. $${MIN_WITHDRAWAL.toFixed(2)})`}
            placeholder="5.00"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <FlameButton onClick={submitWithdrawal} className="w-full" disabled={loading}>
            {loading ? "Отправка..." : "Вывести"}
          </FlameButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Wallet className="w-6 h-6 text-primary" /> Кошелёк
      </h2>

      <GlassCard className="p-6 text-center" glow>
        <p className="text-sm text-muted-foreground mb-1">Баланс</p>
        <p className="text-3xl font-bold text-primary">${balance.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-1">USDT / Credits</p>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3">
        <FlameButton onClick={() => setMode("deposit")} className="w-full">
          <ArrowDownToLine className="w-4 h-4 mr-2" /> Пополнить
        </FlameButton>
        <FlameButton onClick={() => setMode("withdraw")} variant="outline" className="w-full">
          <ArrowUpFromLine className="w-4 h-4 mr-2" /> Вывести
        </FlameButton>
      </div>
    </div>
  );
}
