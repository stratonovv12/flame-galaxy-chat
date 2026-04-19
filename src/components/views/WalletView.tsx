import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, Copy, CheckCircle,
  ArrowLeftRight, TrendingUp, TrendingDown, ChevronLeft, Shield, QrCode
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { QRCodeSVG } from "qrcode.react";

const MIN_DEPOSIT = 0.5;
const MIN_WITHDRAWAL = 1.0;
const SWAP_FEE = 0.01;
const REFRESH_INTERVAL = 10000;

const COINGECKO_IDS: Record<string, string> = {
  btc: "bitcoin", eth: "ethereum", usdt: "tether", ton: "the-open-network", sol: "solana", bnb: "binancecoin",
};

interface CoinInfo {
  id: string; symbol: string; name: string; price: number; change24h: number; marketCap: string; color: string; network: string; depositAddress: string; prevPrice?: number;
}

const COIN_META: Omit<CoinInfo, "price" | "change24h" | "marketCap">[] = [
  { id: "btc", symbol: "BTC", name: "Bitcoin", color: "#F7931A", network: "Bitcoin", depositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "eth", symbol: "ETH", name: "Ethereum", color: "#627EEA", network: "ERC-20", depositAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18" },
  { id: "usdt", symbol: "USDT", name: "Tether", color: "#26A17B", network: "TRC-20", depositAddress: "TXqZ3bR9kE7vF2dW8mL5nP1cY6aJ4sU0xH" },
  { id: "ton", symbol: "TON", name: "Toncoin", color: "#0098EA", network: "TON", depositAddress: "EQBvW8Z5huBkMJYdnfAEM5JqTNkuFX17Uv7On1W9qJoc_pbt" },
  { id: "sol", symbol: "SOL", name: "Solana", color: "#9945FF", network: "Solana", depositAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" },
  { id: "bnb", symbol: "BNB", name: "BNB", color: "#F0B90B", network: "BEP-20", depositAddress: "0x28C6c06298d514Db089934071355E5743bf21d60" },
];

function formatMcap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

function generateChartData(basePrice: number, points: number, volatility: number) {
  const data = [];
  let price = basePrice * (0.95 + Math.random() * 0.05);
  const now = Date.now();
  const interval = points === 12 ? 5 * 60000 : points === 24 ? 3600000 : 86400000;
  for (let i = 0; i < points; i++) {
    price += price * (Math.random() - 0.48) * volatility;
    data.push({ time: new Date(now - (points - i) * interval).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), price: Math.round(price * 100) / 100 });
  }
  data.push({ time: "Now", price: basePrice });
  return data;
}

type ViewMode = "main" | "coin" | "deposit" | "withdraw" | "swap";

export function WalletView() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [balance, setBalance] = useState(0);
  const [myWalletAddress, setMyWalletAddress] = useState<string>("");
  const [showQR, setShowQR] = useState(false);
  const [mode, setMode] = useState<ViewMode>("main");
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<CoinInfo | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"1H" | "1D" | "1W">("1D");
  const [swapFrom, setSwapFrom] = useState("usdt");
  const [swapTo, setSwapTo] = useState("btc");
  const [swapAmount, setSwapAmount] = useState("");
  const [securityPin, setSecurityPin] = useState("");

  const [coins, setCoins] = useState<CoinInfo[]>(COIN_META.map(m => ({ ...m, price: 0, change24h: 0, marketCap: "$0", prevPrice: 0 })));
  const [priceFlash, setPriceFlash] = useState<Record<string, "up" | "down" | null>>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  const fetchPrices = useCallback(async () => {
    try {
      const ids = Object.values(COINGECKO_IDS).join(",");
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`);
      if (!res.ok) return;
      const data = await res.json();
      const flashes: Record<string, "up" | "down" | null> = {};
      setCoins(prev => prev.map(coin => {
        const geckoId = COINGECKO_IDS[coin.id];
        const d = data[geckoId];
        if (!d) return coin;
        const newPrice = d.usd || coin.price;
        const oldPrice = prevPricesRef.current[coin.id] || newPrice;
        if (oldPrice !== 0 && newPrice !== oldPrice) flashes[coin.id] = newPrice > oldPrice ? "up" : "down";
        prevPricesRef.current[coin.id] = newPrice;
        return { ...coin, price: newPrice, change24h: d.usd_24h_change ?? coin.change24h, marketCap: formatMcap(d.usd_market_cap || 0) };
      }));
      setPriceFlash(flashes);
      setTimeout(() => setPriceFlash({}), 1200);
    } catch { /* keep last prices */ }
  }, []);

  useEffect(() => { fetchPrices(); const interval = setInterval(fetchPrices, REFRESH_INTERVAL); return () => clearInterval(interval); }, [fetchPrices]);
  useEffect(() => { fetchBalance(); }, [user]);

  const fetchBalance = async () => {
    if (!user) return;
    const { data } = await supabase.from("wallets").select("balance, wallet_address").eq("user_id", user.id).maybeSingle();
    if (data) {
      setBalance(Number(data.balance));
      setMyWalletAddress((data as any).wallet_address || "");
    } else {
      const { data: created } = await supabase.from("wallets").insert({ user_id: user.id, balance: 0 }).select("balance, wallet_address").maybeSingle();
      setBalance(0);
      setMyWalletAddress((created as any)?.wallet_address || "");
    }
  };

  const portfolioUsd = balance;

  const chartData = useMemo(() => {
    if (!selectedCoin) return [];
    const points = chartPeriod === "1H" ? 12 : chartPeriod === "1D" ? 24 : 7;
    const vol = chartPeriod === "1H" ? 0.002 : chartPeriod === "1D" ? 0.008 : 0.025;
    return generateChartData(selectedCoin.price, points, vol);
  }, [selectedCoin, chartPeriod]);

  const copyAddress = (addr: string) => { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const submitDeposit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < MIN_DEPOSIT) { toast({ title: t("error"), description: `${t("minDeposit")} — $${MIN_DEPOSIT.toFixed(2)}`, variant: "destructive" }); return; }
    if (!user) return;
    setLoading(true);
    await supabase.from("deposit_requests").insert({ user_id: user.id, amount: num, type: "deposit" } as any);
    toast({ title: t("requestCreated"), description: t("sendCryptoToAddress") });
    setAmount(""); setMode("main"); setLoading(false);
  };

  const submitWithdrawal = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < MIN_WITHDRAWAL) { toast({ title: t("error"), description: `${t("minWithdrawal")} — $${MIN_WITHDRAWAL.toFixed(2)}`, variant: "destructive" }); return; }
    if (num > balance) { toast({ title: t("error"), description: t("insufficientFunds"), variant: "destructive" }); return; }
    if (!walletAddress.trim()) { toast({ title: t("error"), description: t("enterWalletAddress"), variant: "destructive" }); return; }
    if (securityPin.length !== 6 || !/^\d{6}$/.test(securityPin)) { toast({ title: t("error"), description: t("enter6DigitPin"), variant: "destructive" }); return; }
    if (!user) return;
    setLoading(true);
    await supabase.from("deposit_requests").insert({ user_id: user.id, amount: num, type: "withdrawal", wallet_address: walletAddress.trim() } as any);
    toast({ title: t("withdrawRequestCreated"), description: t("withdrawAfterReview") });
    setAmount(""); setWalletAddress(""); setSecurityPin(""); setMode("main"); setLoading(false);
  };

  const submitSwap = async () => {
    const num = parseFloat(swapAmount);
    if (isNaN(num) || num <= 0) { toast({ title: t("error"), description: t("enterAmount"), variant: "destructive" }); return; }
    const fromCoin = coins.find(c => c.id === swapFrom)!;
    const toCoin = coins.find(c => c.id === swapTo)!;
    const usdValue = num * fromCoin.price;
    if (usdValue > balance) { toast({ title: t("error"), description: t("insufficientFunds"), variant: "destructive" }); return; }
    const fee = usdValue * SWAP_FEE;
    const receiveUsd = usdValue - fee;
    const receiveAmount = receiveUsd / toCoin.price;
    toast({ title: t("swapDone"), description: `${num} ${fromCoin.symbol} → ${receiveAmount.toFixed(6)} ${toCoin.symbol} (${t("commission")}: $${fee.toFixed(2)})` });
    setSwapAmount("");
  };

  const openCoin = (coin: CoinInfo) => { setSelectedCoin(coin); setMode("coin"); };

  useEffect(() => {
    if (selectedCoin) {
      const updated = coins.find(c => c.id === selectedCoin.id);
      if (updated && updated.price !== selectedCoin.price) setSelectedCoin(updated);
    }
  }, [coins, selectedCoin]);

  // COIN DETAIL
  if (mode === "coin" && selectedCoin) {
    const isPositive = selectedCoin.change24h >= 0;
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button onClick={() => { setMode("main"); setSelectedCoin(null); }} className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ChevronLeft className="w-4 h-4" /> {t("back")}
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: selectedCoin.color + "22", color: selectedCoin.color }}>{selectedCoin.symbol[0]}</div>
          <div>
            <h2 className="text-xl font-bold">{selectedCoin.name} <span className="text-muted-foreground text-sm">{selectedCoin.symbol}</span></h2>
            <p className="text-xs text-muted-foreground">{t("network")}: {selectedCoin.network}</p>
          </div>
        </div>
        <GlassCard className="p-4" glow>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className={`text-2xl font-bold transition-colors duration-500 ${priceFlash[selectedCoin.id] === "up" ? "text-green-400" : priceFlash[selectedCoin.id] === "down" ? "text-red-400" : ""}`} style={{ color: !priceFlash[selectedCoin.id] ? selectedCoin.color : undefined }}>
                ${selectedCoin.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <div className={`flex items-center gap-1 text-sm ${isPositive ? "text-green-400" : "text-red-400"}`}>
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {isPositive ? "+" : ""}{selectedCoin.change24h.toFixed(2)}% (24h)
              </div>
            </div>
            <p className="text-xs text-muted-foreground">MCap: {selectedCoin.marketCap}</p>
          </div>
          <div className="flex gap-1 mb-3">
            {(["1H", "1D", "1W"] as const).map(p => (
              <button key={p} onClick={() => setChartPeriod(p)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${chartPeriod === p ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>{p}</button>
            ))}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs><linearGradient id={`grad-${selectedCoin.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={selectedCoin.color} stopOpacity={0.4} /><stop offset="100%" stopColor={selectedCoin.color} stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(270 15% 60%)" }} axisLine={false} tickLine={false} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "hsl(270 15% 60%)" }} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => selectedCoin.price > 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ background: "hsl(240 25% 12%)", border: "1px solid hsl(260 30% 25%)", borderRadius: 8, color: "hsl(270 30% 95%)" }} formatter={(v: number) => [`$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Price"]} />
                <Area type="monotone" dataKey="price" stroke={selectedCoin.color} strokeWidth={2} fill={`url(#grad-${selectedCoin.id})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
        <GlassCard className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{t("depositAddress")} ({selectedCoin.network})</h3>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
            <code className="text-[10px] flex-1 break-all" style={{ color: selectedCoin.color }}>{selectedCoin.depositAddress}</code>
            <button onClick={() => copyAddress(selectedCoin.depositAddress)} className="shrink-0 p-1.5 hover:bg-muted rounded">
              {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
          <div className="mx-auto w-32 h-32 bg-white rounded-lg flex items-center justify-center">
            <div className="grid grid-cols-5 gap-0.5 w-24 h-24">
              {Array.from({ length: 25 }).map((_, i) => (<div key={i} className={`w-full aspect-square ${Math.random() > 0.4 ? "bg-black" : "bg-white"}`} />))}
            </div>
          </div>
          <p className="text-[10px] text-center text-muted-foreground">{t("sendOnly")} {selectedCoin.symbol} ({selectedCoin.network})</p>
        </GlassCard>
      </div>
    );
  }

  // DEPOSIT
  if (mode === "deposit") {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        <button onClick={() => setMode("main")} className="flex items-center gap-1 text-sm text-primary hover:underline"><ChevronLeft className="w-4 h-4" /> {t("back")}</button>
        <h2 className="text-xl font-bold">{t("topUp")}</h2>
        <GlassCard className="p-6 space-y-4" glow>
          <p className="text-sm text-muted-foreground">{t("selectCoinDeposit")}</p>
          <div className="grid grid-cols-3 gap-2">
            {coins.map(c => (
              <button key={c.id} onClick={() => openCoin(c)} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/50 transition-colors">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: c.color + "22", color: c.color }}>{c.symbol[0]}</div>
                <span className="text-xs font-medium">{c.symbol}</span>
              </button>
            ))}
          </div>
          <FlameInput label={`${t("minDeposit")} $${MIN_DEPOSIT.toFixed(2)}`} placeholder="10.00" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          <FlameButton onClick={submitDeposit} className="w-full" disabled={loading}>{loading ? t("sending") : t("createRequest")}</FlameButton>
        </GlassCard>
      </div>
    );
  }

  // WITHDRAW
  if (mode === "withdraw") {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        <button onClick={() => setMode("main")} className="flex items-center gap-1 text-sm text-primary hover:underline"><ChevronLeft className="w-4 h-4" /> {t("back")}</button>
        <h2 className="text-xl font-bold">{t("withdrawal")}</h2>
        <GlassCard className="p-6 space-y-4" glow>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{t("available")}</p>
            <p className="text-2xl font-bold text-primary">${balance.toFixed(2)}</p>
          </div>
          <FlameInput label={t("cryptoWalletAddress")} placeholder="0x... / T... / bc1..." value={walletAddress} onChange={e => setWalletAddress(e.target.value)} />
          <FlameInput label={`${t("minWithdrawal")} $${MIN_WITHDRAWAL.toFixed(2)}`} placeholder="5.00" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5"><Shield className="w-3.5 h-3.5 inline mr-1" /> {t("securityPin")}</label>
            <input type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={securityPin} onChange={e => setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-center text-lg tracking-[0.5em] placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <FlameButton onClick={submitWithdrawal} className="w-full" disabled={loading}>{loading ? t("sending") : t("withdrawBtn")}</FlameButton>
        </GlassCard>
      </div>
    );
  }

  // SWAP
  if (mode === "swap") {
    const fromCoin = coins.find(c => c.id === swapFrom)!;
    const toCoin = coins.find(c => c.id === swapTo)!;
    const swapNum = parseFloat(swapAmount) || 0;
    const usdVal = swapNum * fromCoin.price;
    const fee = usdVal * SWAP_FEE;
    const receiveVal = (usdVal - fee) / toCoin.price;

    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        <button onClick={() => setMode("main")} className="flex items-center gap-1 text-sm text-primary hover:underline"><ChevronLeft className="w-4 h-4" /> {t("back")}</button>
        <h2 className="text-xl font-bold flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-primary" /> {t("swap")}</h2>
        <GlassCard className="p-6 space-y-4" glow>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">{t("youGive")}</label>
            <div className="flex gap-2">
              <select value={swapFrom} onChange={e => setSwapFrom(e.target.value)} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                {coins.map(c => <option key={c.id} value={c.id}>{c.symbol}</option>)}
              </select>
              <input type="number" placeholder="0.00" value={swapAmount} onChange={e => setSwapAmount(e.target.value)} className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div className="flex justify-center">
            <button onClick={() => { setSwapFrom(swapTo); setSwapTo(swapFrom); }} className="p-2 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors">
              <ArrowLeftRight className="w-4 h-4 text-primary" />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">{t("youReceive")}</label>
            <div className="flex gap-2">
              <select value={swapTo} onChange={e => setSwapTo(e.target.value)} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                {coins.filter(c => c.id !== swapFrom).map(c => <option key={c.id} value={c.id}>{c.symbol}</option>)}
              </select>
              <div className="flex-1 rounded-lg border border-border bg-muted/10 px-4 py-2.5 text-sm text-muted-foreground">
                ≈ {receiveVal > 0 ? receiveVal.toFixed(6) : "0.00"} {toCoin.symbol}
              </div>
            </div>
          </div>
          {swapNum > 0 && (
            <div className="text-xs space-y-1 text-muted-foreground border-t border-border pt-3">
              <div className="flex justify-between"><span>{t("value")}</span><span>${usdVal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>{t("commissionFee")}</span><span className="text-primary">${fee.toFixed(2)}</span></div>
              <div className="flex justify-between font-medium text-foreground"><span>{t("totalReceive")}</span><span>{receiveVal.toFixed(6)} {toCoin.symbol}</span></div>
            </div>
          )}
          <FlameButton onClick={submitSwap} className="w-full" disabled={swapFrom === swapTo}>{t("swapBtn")}</FlameButton>
        </GlassCard>
      </div>
    );
  }

  // MAIN
  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h2 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-primary" /> {t("exchange")}</h2>
      <GlassCard className="p-5 text-center" glow>
        <p className="text-xs text-muted-foreground mb-1">{t("portfolio")}</p>
        <p className="text-3xl font-bold text-primary">${portfolioUsd.toFixed(2)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{t("updateEvery10s")}</p>
      </GlassCard>
      <div className="grid grid-cols-3 gap-2">
        <FlameButton onClick={() => setMode("deposit")} className="w-full text-xs"><ArrowDownToLine className="w-4 h-4 mr-1" /> {t("deposit")}</FlameButton>
        <FlameButton onClick={() => setMode("withdraw")} variant="outline" className="w-full text-xs"><ArrowUpFromLine className="w-4 h-4 mr-1" /> {t("withdraw")}</FlameButton>
        <FlameButton onClick={() => setMode("swap")} variant="outline" className="w-full text-xs"><ArrowLeftRight className="w-4 h-4 mr-1" /> {t("swap")}</FlameButton>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("marketLive")}</h3>
        <div className="space-y-1.5">
          {coins.map(coin => {
            const isPositive = coin.change24h >= 0;
            const flash = priceFlash[coin.id];
            return (
              <button key={coin.id} onClick={() => openCoin(coin)} className={`w-full flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/50 hover:border-primary/40 transition-all group ${flash === "up" ? "ring-1 ring-green-400/50" : flash === "down" ? "ring-1 ring-red-400/50" : ""}`}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ background: coin.color + "22", color: coin.color }}>{coin.symbol[0]}</div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold">{coin.symbol} <span className="text-xs text-muted-foreground font-normal">{coin.name}</span></p>
                  <p className="text-[10px] text-muted-foreground">{coin.network}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold transition-colors duration-500 ${flash === "up" ? "text-green-400" : flash === "down" ? "text-red-400" : ""}`}>
                    {coin.price > 0 ? `$${coin.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                  </p>
                  <p className={`text-xs flex items-center justify-end gap-0.5 ${isPositive ? "text-green-400" : "text-red-400"}`}>
                    {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {isPositive ? "+" : ""}{coin.change24h.toFixed(2)}%
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
