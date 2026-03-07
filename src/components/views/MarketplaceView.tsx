import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { MediaUpload } from "@/components/ui/MediaUpload";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ShoppingBag, Plus, X, Tag, Wallet, ArrowLeft, Send } from "lucide-react";
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

export function MarketplaceView() {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  // Create form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    fetchListings();
    fetchBalance();
  }, [user]);

  const fetchBalance = async () => {
    if (!user) return;
    const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    if (data) {
      setBalance(Number(data.balance));
    } else {
      // Create wallet if not exists
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

  const createListing = async () => {
    if (!title.trim() || !price || !user) return;
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
      toast({ title: "Товар выставлен на продажу!" });
      setTitle(""); setDescription(""); setPrice(""); setImageUrl(""); setShowCreate(false);
      fetchListings();
    }
    setLoading(false);
  };

  const buyItem = async (listing: Listing) => {
    if (!user) return;
    if (listing.seller_id === user.id) {
      toast({ title: "Ошибка", description: "Нельзя купить свой товар", variant: "destructive" });
      return;
    }
    if (balance < listing.price) {
      toast({ title: "Недостаточно средств", description: `Нужно $${listing.price}, у вас $${balance.toFixed(2)}`, variant: "destructive" });
      return;
    }
    if (!confirm(`Купить "${listing.title}" за $${listing.price}? Комиссия 5%.`)) return;

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
      toast({ title: "Покупка завершена!", description: "Ожидайте трейд от продавца." });
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

  if (showCreate) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted/50 rounded-lg touch-target">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold">Новый товар</h2>
        </div>

        <GlassCard className="p-6 space-y-4" glow>
          <FlameInput label="Название" placeholder="CS2 AWP | Dragon Lore" value={title} onChange={e => setTitle(e.target.value)} />
          <FlameInput label="Описание" placeholder="Factory New, StatTrak™" value={description} onChange={e => setDescription(e.target.value)} />
          <FlameInput label="Цена (USD)" placeholder="99.99" type="number" value={price} onChange={e => setPrice(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">Изображение</label>
            <div className="flex items-center gap-3">
              <MediaUpload onUpload={setImageUrl} />
              {imageUrl && <img src={imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover" />}
            </div>
          </div>
          <FlameButton onClick={createListing} className="w-full" disabled={!title.trim() || !price || loading}>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {listings.map(listing => (
            <GlassCard key={listing.id} className="overflow-hidden">
              {listing.image_url && (
                <img src={listing.image_url} alt={listing.title}
                  className="w-full h-40 object-cover" />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-sm">{listing.title}</h3>
                  <span className="text-primary font-bold whitespace-nowrap ml-2">${listing.price.toFixed(2)}</span>
                </div>
                {listing.description && (
                  <p className="text-xs text-muted-foreground">{listing.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UserAvatar username={listing.seller_username} avatarUrl={listing.seller_avatar} size="xs" />
                  <span>{listing.seller_username || "Продавец"}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(listing.created_at), { addSuffix: true, locale: ru })}</span>
                </div>

                {user && listing.seller_id === user.id ? (
                  <FlameButton variant="outline" size="sm" className="w-full border-destructive/50 text-destructive" onClick={() => deleteListing(listing.id)}>
                    <X className="w-3 h-3 mr-1" /> Снять
                  </FlameButton>
                ) : (
                  <FlameButton size="sm" className="w-full" onClick={() => buyItem(listing)} disabled={buying === listing.id}>
                    {buying === listing.id ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        Обработка...
                      </span>
                    ) : (
                      <>
                        <Tag className="w-3 h-3 mr-1" /> Купить
                      </>
                    )}
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
