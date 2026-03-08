import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Package, Gift, Send, Eye, EyeOff, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface InventoryItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  acquired_at: string;
  is_hidden: boolean;
}

export function InventoryView() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [giftingId, setGiftingId] = useState<string | null>(null);
  const [giftUsername, setGiftUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [visibility, setVisibility] = useState("public");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchInventory();
    fetchVisibility();
  }, [user]);

  const fetchVisibility = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("inventory_visibility").eq("user_id", user.id).maybeSingle();
    if (data && (data as any).inventory_visibility) setVisibility((data as any).inventory_visibility);
  };

  const updateVisibility = async (v: string) => {
    if (!user) return;
    setVisibility(v);
    await supabase.from("profiles").update({ inventory_visibility: v } as any).eq("user_id", user.id);
    toast({ title: "Настройки обновлены" });
  };

  const fetchInventory = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_inventory")
      .select("*")
      .eq("owner_id", user.id)
      .order("acquired_at", { ascending: false });
    setItems((data as InventoryItem[]) || []);
    setLoading(false);
  };

  const toggleHide = async (itemId: string, currentlyHidden: boolean) => {
    await supabase.from("user_inventory").update({ is_hidden: !currentlyHidden } as any).eq("id", itemId);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, is_hidden: !currentlyHidden } : i));
    toast({ title: currentlyHidden ? "Предмет показан" : "Предмет скрыт" });
  };

  const giftItem = async (itemId: string) => {
    if (!user || !giftUsername.trim()) return;
    setSending(true);
    const cleanUsername = giftUsername.replace(/^@/, "").trim();
    const { data, error } = await supabase.rpc("gift_item", {
      _item_id: itemId,
      _from_user: user.id,
      _to_username: cleanUsername,
    });
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else if (data && typeof data === "object" && "error" in data) {
      toast({ title: "Ошибка", description: (data as any).error, variant: "destructive" });
    } else {
      toast({ title: "Подарок отправлен!" });
      setGiftingId(null);
      setGiftUsername("");
      fetchInventory();
    }
    setSending(false);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" /> Инвентарь
        </h2>
        <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-muted/50 rounded-lg transition-colors">
          <Settings className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {showSettings && (
        <GlassCard className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">Видимость инвентаря</h3>
          <div className="flex gap-2">
            {[
              { value: "public", label: "Публичный" },
              { value: "friends", label: "Только друзья" },
              { value: "private", label: "Приватный" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => updateVisibility(opt.value)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                  visibility === opt.value
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "border-border hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : items.length === 0 ? (
        <GlassCard className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">Инвентарь пуст</h3>
          <p className="text-muted-foreground">Купите скины на маркетплейсе</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <GlassCard key={item.id} className={`overflow-hidden ${item.is_hidden ? "opacity-60" : ""}`}>
              {item.image_url && (
                <img src={item.image_url} alt={item.title} className="w-full h-36 object-cover" />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{item.title}</h3>
                  <button
                    onClick={() => toggleHide(item.id, item.is_hidden)}
                    className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors"
                    title={item.is_hidden ? "Показать" : "Скрыть"}
                  >
                    {item.is_hidden ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}

                {giftingId === item.id ? (
                  <div className="space-y-2">
                    <FlameInput
                      placeholder="@username получателя"
                      value={giftUsername}
                      onChange={(e) => setGiftUsername(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <FlameButton size="sm" className="flex-1" onClick={() => giftItem(item.id)} disabled={!giftUsername.trim() || sending}>
                        <Send className="w-3 h-3 mr-1" /> {sending ? "..." : "Отправить"}
                      </FlameButton>
                      <FlameButton size="sm" variant="outline" onClick={() => { setGiftingId(null); setGiftUsername(""); }}>
                        Отмена
                      </FlameButton>
                    </div>
                  </div>
                ) : (
                  <FlameButton size="sm" variant="outline" className="w-full" onClick={() => setGiftingId(item.id)}>
                    <Gift className="w-3 h-3 mr-1" /> Подарить
                  </FlameButton>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
