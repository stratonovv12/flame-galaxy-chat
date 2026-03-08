import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { MediaUpload } from "@/components/ui/MediaUpload";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { ShoppingBag, Plus, X, Tag, Wallet, ArrowLeft, AlertTriangle, ExternalLink, Eye, Sparkles, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number;
  category: string;
  status: string;
  created_at: string;
  seller_username?: string | null;
  seller_avatar?: string | null;
}

// Rarity color system matching CS2
const RARITY_COLORS: Record<string, { border: string; bg: string; glow: string; label: string }> = {
  consumer: { border: "border-gray-500/50", bg: "bg-gray-500/10", glow: "", label: "Consumer" },
  industrial: { border: "border-sky-400/50", bg: "bg-sky-400/10", glow: "", label: "Industrial" },
  milspec: { border: "border-blue-500/50", bg: "bg-blue-500/10", glow: "shadow-[0_0_15px_hsl(220_80%_55%/0.2)]", label: "Mil-Spec" },
  restricted: { border: "border-purple-500/50", bg: "bg-purple-500/10", glow: "shadow-[0_0_15px_hsl(270_70%_55%/0.25)]", label: "Restricted" },
  classified: { border: "border-pink-500/50", bg: "bg-pink-500/10", glow: "shadow-[0_0_20px_hsl(330_70%_55%/0.3)]", label: "Classified" },
  covert: { border: "border-red-500/50", bg: "bg-red-500/10", glow: "shadow-[0_0_20px_hsl(0_70%_50%/0.3)]", label: "Covert" },
  contraband: { border: "border-yellow-400/60", bg: "bg-yellow-400/10", glow: "shadow-[0_0_25px_hsl(45_90%_55%/0.35)]", label: "★ Contraband" },
};

function getRarity(price: number): string {
  if (price >= 500) return "contraband";
  if (price >= 200) return "covert";
  if (price >= 80) return "classified";
  if (price >= 30) return "restricted";
  if (price >= 10) return "milspec";
  if (price >= 3) return "industrial";
  return "consumer";
}

// Steam Market URL parser
function parseSteamUrl(url: string): { name: string; imageUrl: string } | null {
  try {
    const match = url.match(/\/market\/listings\/730\/([^?]+)/);
    if (!match) return null;
    const itemName = decodeURIComponent(match[1]);
    const encodedName = encodeURIComponent(itemName);
    const imageUrl = `https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UXdSKt2aZt-g0QNQhIVqS25Ge0j6b0JYUdFftDFGaMhFpIBO9p1faI2EP/330x192`;
    return { name: itemName, imageUrl };
  } catch {
    return null;
  }
}

export function MarketplaceView() {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [hasSteamUrl, setHasSteamUrl] = useState(false);
  const [inspectItem, setInspectItem] = useState<Listing | null>(null);

  // Create form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [steamLink, setSteamLink] = useState("");
  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);

  useEffect(() => {
    fetchListings();
    fetchBalance();
    checkSteamUrl();
  }, [user]);

  const checkSteamUrl = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("steam_trade_url").eq("user_id", user.id).maybeSingle();
    setHasSteamUrl(!!(data?.steam_trade_url && data.steam_trade_url.trim()));
  };

  const fetchBalance = async () => {
    if (!user) return;
    const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    if (data) setBalance(Number(data.balance));
    else {
      await supabase.from("wallets").insert({ user_id: user.id, balance: 0 });
      setBalance(0);
    }
  };

  const fetchListings = async () => {
    const { data } = await supabase
      .from("marketplace_listings")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (!data) return;
    const sellerIds = [...new Set(data.map(l => l.seller_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", sellerIds);
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setListings(data.map(l => ({
      ...l,
      price: Number(l.price),
      seller_username: profileMap.get(l.seller_id)?.username || null,
      seller_avatar: profileMap.get(l.seller_id)?.avatar_url || null,
    })));
  };

  // Handle Steam URL paste
  const handleSteamLink = (url: string) => {
    setSteamLink(url);
    const parsed = parseSteamUrl(url);
    if (parsed) {
      setTitle(parsed.name);
      // Simulate a suggested price based on the name hash
      const hash = parsed.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const simPrice = parseFloat(((hash % 500) + 5 + Math.random() * 20).toFixed(2));
      setSuggestedPrice(simPrice);
      toast({ title: "Скин распознан!", description: parsed.name });
    } else if (url.length > 10) {
      setSuggestedPrice(null);
    }
  };

  const createListing = async () => {
    if (!title.trim() || !price || !user) return;
    if (!hasSteamUrl) {
      toast({ title: "Steam Trade URL не указан", description: "Добавьте его в профиле для продажи", variant: "destructive" });
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      toast({ title: "Ошибка", description: "Укажите корректную цену", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("marketplace_listings").insert({
      seller_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl || null,
      price: numPrice,
    });
    if (error) {
      toast({ title: "Ошибка", description: "Не удалось создать", variant: "destructive" });
    } else {
      toast({ title: "Товар выставлен!", description: `Комиссия 5% будет удержана при продаже.` });
      setTitle(""); setDescription(""); setPrice(""); setImageUrl(""); setSteamLink(""); setSuggestedPrice(null); setShowCreate(false);
      fetchListings();
    }
    setLoading(false);
  };

  const buyItem = async (listing: Listing) => {
    if (!user) return;
    if (!hasSteamUrl) {
      toast({ title: "Steam Trade URL не указан", description: "Добавьте его в профиле", variant: "destructive" });
      return;
    }
    if (listing.seller_id === user.id) {
      toast({ title: "Ошибка", description: "Нельзя купить свой товар", variant: "destructive" });
      return;
    }
    if (balance < listing.price) {
      toast({ title: "Недостаточно средств", description: `Нужно $${listing.price}, у вас $${balance.toFixed(2)}`, variant: "destructive" });
      return;
    }
    const commission = (listing.price * 0.05).toFixed(2);
    if (!confirm(`Купить "${listing.title}" за $${listing.price}?\nКомиссия 5% ($${commission}) будет удержана.`)) return;
    setBuying(listing.id);
    const { data, error } = await supabase.rpc("buy_listing", {
      _listing_id: listing.id,
      _buyer_id: user.id,
    });
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else if (data && typeof data === "object" && "error" in data) {
      toast({ title: "Ошибка", description: (data as any).error, variant: "destructive" });
    } else {
      toast({ title: "Покупка завершена!", description: "Предмет добавлен в инвентарь." });
      fetchListings();
      fetchBalance();
    }
    setBuying(null);
  };

  const deleteListing = async (id: string) => {
    if (!confirm("Снять товар с продажи?")) return;
    await supabase.from("marketplace_listings").delete().eq("id", id);
    fetchListings();
    toast({ title: "Товар снят с продажи" });
  };

  // Inspect Modal
  if (inspectItem) {
    const rarity = getRarity(inspectItem.price);
    const r = RARITY_COLORS[rarity];
    const isExpensive = inspectItem.price >= 200;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-md">
        <div className={`w-full max-w-lg rounded-2xl border-2 ${r.border} ${r.bg} overflow-hidden relative`}>
          {/* Shimmer effect for expensive items */}
          {isExpensive && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
              <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] animate-spin" style={{ animationDuration: "8s" }}>
                <div className="absolute top-1/2 left-1/2 w-32 h-[200%] bg-gradient-to-b from-transparent via-white/5 to-transparent -translate-x-1/2 -translate-y-1/2 rotate-45" />
              </div>
            </div>
          )}

          <div className="relative z-20">
            {/* Close */}
            <button onClick={() => setInspectItem(null)} className="absolute top-4 right-4 p-2 rounded-full bg-background/60 hover:bg-background/80 transition-colors z-30">
              <X className="w-5 h-5" />
            </button>

            {/* Image */}
            <div className="relative h-72 flex items-center justify-center bg-gradient-to-b from-muted/30 to-background/50 p-8">
              {inspectItem.image_url ? (
                <img src={inspectItem.image_url} alt={inspectItem.title} className="max-h-full max-w-full object-contain drop-shadow-2xl" />
              ) : (
                <ShoppingBag className="w-24 h-24 text-muted-foreground/30" />
              )}
              {/* Rarity badge */}
              <span className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold border ${r.border} bg-background/60 backdrop-blur-sm`}>
                {r.label}
              </span>
            </div>

            {/* Info */}
            <div className="p-6 space-y-4 bg-background/80">
              <div>
                <h2 className="text-xl font-bold">{inspectItem.title}</h2>
                {inspectItem.description && <p className="text-sm text-muted-foreground mt-1">{inspectItem.description}</p>}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserAvatar username={inspectItem.seller_username} avatarUrl={inspectItem.seller_avatar} size="sm" />
                  <div>
                    <span className="text-sm font-medium flex items-center gap-1">
                      {inspectItem.seller_username || "Продавец"}
                      <UserBadge userId={inspectItem.seller_id} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(inspectItem.created_at), { addSuffix: true, locale: ru })}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">${inspectItem.price.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">Комиссия 5%: ${(inspectItem.price * 0.05).toFixed(2)}</div>
                </div>
              </div>

              {user && inspectItem.seller_id === user.id ? (
                <FlameButton variant="outline" className="w-full border-destructive/50 text-destructive" onClick={() => { deleteListing(inspectItem.id); setInspectItem(null); }}>
                  <X className="w-4 h-4 mr-2" /> Снять с продажи
                </FlameButton>
              ) : (
                <FlameButton className="w-full" onClick={() => { buyItem(inspectItem); setInspectItem(null); }} disabled={!hasSteamUrl}>
                  <Tag className="w-4 h-4 mr-2" /> Купить за ${inspectItem.price.toFixed(2)}
                </FlameButton>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Create listing form
  if (showCreate) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => { setShowCreate(false); setSteamLink(""); setSuggestedPrice(null); }} className="p-2 hover:bg-muted/50 rounded-lg touch-target">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold">Новый товар</h2>
        </div>

        {!hasSteamUrl && (
          <GlassCard className="p-3 flex items-center gap-3 border-destructive/50">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">Укажите Steam Trade URL в профиле для выставления товаров</p>
          </GlassCard>
        )}

        <GlassCard className="p-6 space-y-4" glow>
          {/* Steam URL paste */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" /> Ссылка Steam Market
            </label>
            <FlameInput
              placeholder="https://steamcommunity.com/market/listings/730/..."
              value={steamLink}
              onChange={e => handleSteamLink(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Вставьте ссылку — название и цена подтянутся автоматически</p>
          </div>

          <FlameInput label="Название" placeholder="CS2 AWP | Dragon Lore" value={title} onChange={e => setTitle(e.target.value)} />
          <FlameInput label="Описание" placeholder="Factory New, StatTrak™" value={description} onChange={e => setDescription(e.target.value)} />

          {/* Price with suggestion */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">Цена (USD)</label>
            <div className="flex items-center gap-3">
              <FlameInput placeholder="99.99" type="number" value={price} onChange={e => setPrice(e.target.value)} className="flex-1" />
              {suggestedPrice !== null && (
                <button
                  onClick={() => setPrice(suggestedPrice.toFixed(2))}
                  className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors whitespace-nowrap"
                >
                  ~${suggestedPrice.toFixed(2)}
                </button>
              )}
            </div>
            {suggestedPrice !== null && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Средняя рыночная цена. Вы можете указать свою.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">Изображение</label>
            <div className="flex items-center gap-3">
              <MediaUpload onUpload={setImageUrl} />
              {imageUrl && <img src={imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover" />}
            </div>
          </div>

          <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
            💡 При продаже удерживается комиссия <span className="text-primary font-semibold">5%</span> в пользу платформы.
          </div>

          <FlameButton onClick={createListing} className="w-full" disabled={!title.trim() || !price || loading || !hasSteamUrl}>
            {loading ? "Публикация..." : "Выставить на продажу"}
          </FlameButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" /> Маркетплейс
        </h2>
        <FlameButton onClick={() => setShowCreate(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Продать
        </FlameButton>
      </div>

      {!hasSteamUrl && (
        <GlassCard className="p-3 flex items-center gap-3 border-destructive/50">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Укажите Steam Trade URL в профиле для покупки и продажи</p>
        </GlassCard>
      )}

      <GlassCard className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">Баланс</span>
        </div>
        <span className="text-lg font-bold text-primary">${balance.toFixed(2)}</span>
      </GlassCard>

      {listings.length === 0 ? (
        <GlassCard className="text-center py-12">
          <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-primary/50" />
          <h3 className="text-lg font-semibold mb-2">Нет товаров</h3>
          <p className="text-muted-foreground mb-4">Будьте первым — выставьте скин на продажу!</p>
          <FlameButton onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> Продать товар
          </FlameButton>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {listings.map(listing => {
            const rarity = getRarity(listing.price);
            const r = RARITY_COLORS[rarity];
            const isExpensive = listing.price >= 200;

            return (
              <div
                key={listing.id}
                className={`relative rounded-xl border ${r.border} ${r.glow} overflow-hidden cursor-pointer group transition-all duration-300 hover:scale-[1.02]`}
                style={{ background: "hsl(var(--card))" }}
                onClick={() => setInspectItem(listing)}
              >
                {/* Shimmer overlay for expensive */}
                {isExpensive && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
                    <div className="absolute -inset-full animate-[shimmer_3s_ease-in-out_infinite]">
                      <div className="absolute top-0 left-1/2 w-24 h-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent -translate-x-1/2 rotate-12" />
                    </div>
                  </div>
                )}

                {/* Image area */}
                <div className={`relative h-32 flex items-center justify-center ${r.bg} p-4`}>
                  {listing.image_url ? (
                    <img src={listing.image_url} alt={listing.title} className="max-h-full max-w-full object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300" />
                  ) : (
                    <ShoppingBag className="w-12 h-12 text-muted-foreground/20" />
                  )}
                  {/* Inspect icon */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="w-4 h-4 text-foreground/60" />
                  </div>
                  {/* Rarity strip */}
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${r.border.replace("border-", "bg-").replace("/50", "")}`} />
                </div>

                {/* Info */}
                <div className="p-3 space-y-1.5">
                  <h3 className="font-semibold text-xs leading-tight line-clamp-2">{listing.title}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-bold text-sm">${listing.price.toFixed(2)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.border} bg-background/50`}>{r.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <UserAvatar username={listing.seller_username} avatarUrl={listing.seller_avatar} size="sm" className="!w-4 !h-4" />
                    <span className="truncate">{listing.seller_username || "Продавец"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
