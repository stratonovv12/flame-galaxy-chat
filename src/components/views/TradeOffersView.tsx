import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { ArrowLeftRight, Check, X, Plus, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TradeOffer {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_item_id: string | null;
  receiver_item_id: string | null;
  sender_balance_offer: number;
  status: string;
  created_at: string;
}

interface InvItem {
  id: string;
  title: string;
  image_url: string | null;
}

export function TradeOffersView() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [myItems, setMyItems] = useState<InvItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [receiverUsername, setReceiverUsername] = useState("");
  const [selectedMyItem, setSelectedMyItem] = useState<string>("");
  const [balanceOffer, setBalanceOffer] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchOffers();
    fetchMyItems();
  }, [user]);

  const fetchOffers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("trade_offers")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setOffers((data as TradeOffer[]) || []);
  };

  const fetchMyItems = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_inventory")
      .select("id, title, image_url")
      .eq("owner_id", user.id);
    setMyItems((data as InvItem[]) || []);
  };

  const createOffer = async () => {
    if (!user) return;
    const cleanUsername = receiverUsername.replace(/^@/, "").trim();
    if (!cleanUsername) {
      toast({ title: "Ошибка", description: "Укажите @username", variant: "destructive" });
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("user_id").eq("username", cleanUsername).maybeSingle();
    if (!profile) {
      toast({ title: "Ошибка", description: "Пользователь не найден", variant: "destructive" });
      return;
    }
    if (profile.user_id === user.id) {
      toast({ title: "Ошибка", description: "Нельзя создать трейд с собой", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("trade_offers").insert({
      sender_id: user.id,
      receiver_id: profile.user_id,
      sender_item_id: selectedMyItem || null,
      sender_balance_offer: parseFloat(balanceOffer) || 0,
    } as any);

    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Трейд-предложение отправлено!" });
      setShowCreate(false);
      setReceiverUsername("");
      setSelectedMyItem("");
      setBalanceOffer("");
      fetchOffers();
    }
    setLoading(false);
  };

  const acceptOffer = async (offerId: string) => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("accept_trade", {
      _offer_id: offerId,
      _accepter: user.id,
    });
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else if (data && typeof data === "object" && "error" in data) {
      toast({ title: "Ошибка", description: (data as any).error, variant: "destructive" });
    } else {
      toast({ title: "Трейд завершён!" });
      fetchOffers();
      fetchMyItems();
    }
    setLoading(false);
  };

  const declineOffer = async (offerId: string) => {
    await supabase.from("trade_offers").update({ status: "declined" } as any).eq("id", offerId);
    toast({ title: "Предложение отклонено" });
    fetchOffers();
  };

  if (showCreate) {
    return (
      <div className="p-4 space-y-4 max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted/50 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold">Новый трейд</h2>
        </div>
        <GlassCard className="p-6 space-y-4" glow>
          <FlameInput
            label="@username получателя"
            placeholder="username"
            value={receiverUsername}
            onChange={(e) => setReceiverUsername(e.target.value)}
          />
          {myItems.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-2">Ваш предмет (необязательно)</label>
              <select
                className="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground"
                value={selectedMyItem}
                onChange={(e) => setSelectedMyItem(e.target.value)}
              >
                <option value="">— Не выбрано —</option>
                {myItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.title}</option>
                ))}
              </select>
            </div>
          )}
          <FlameInput
            label="Доплата балансом (USD, необязательно)"
            placeholder="0.00"
            type="number"
            value={balanceOffer}
            onChange={(e) => setBalanceOffer(e.target.value)}
          />
          <FlameButton onClick={createOffer} className="w-full" disabled={loading}>
            {loading ? "Отправка..." : "Отправить предложение"}
          </FlameButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6 text-primary" /> Трейды
        </h2>
        <FlameButton onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Новый
        </FlameButton>
      </div>

      {offers.length === 0 ? (
        <GlassCard className="text-center py-12">
          <ArrowLeftRight className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">Нет активных трейдов</h3>
          <p className="text-muted-foreground">Создайте предложение обмена</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const isReceiver = offer.receiver_id === user?.id;
            return (
              <GlassCard key={offer.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {isReceiver ? "Входящее предложение" : "Исходящее предложение"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(offer.created_at).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                {offer.sender_balance_offer > 0 && (
                  <p className="text-sm text-primary">+ ${Number(offer.sender_balance_offer).toFixed(2)} баланс</p>
                )}
                {isReceiver && (
                  <div className="flex gap-2 mt-3">
                    <FlameButton size="sm" className="flex-1" onClick={() => acceptOffer(offer.id)} disabled={loading}>
                      <Check className="w-3 h-3 mr-1" /> Принять
                    </FlameButton>
                    <FlameButton size="sm" variant="outline" className="flex-1 border-destructive/50 text-destructive" onClick={() => declineOffer(offer.id)}>
                      <X className="w-3 h-3 mr-1" /> Отклонить
                    </FlameButton>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
