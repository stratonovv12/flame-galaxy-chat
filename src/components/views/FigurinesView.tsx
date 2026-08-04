import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gem, Store, Package, ShieldCheck, Gift, ArrowLeft, Tag, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface Figurine {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  rarity: string;
  supply: number;
  price: number;
}

export interface FigurineItem {
  id: string;
  figurine_id: string;
  owner_id: string;
  serial: number;
  showcased: boolean;
  figurines?: Figurine;
}

interface Listing {
  id: string;
  item_id: string;
  seller_id: string;
  price: number;
  status: string;
}

interface Order {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  status: string;
}

const RARITY_STYLES: Record<string, string> = {
  common: "text-zinc-300 border-zinc-500/40",
  rare: "text-sky-300 border-sky-400/40",
  epic: "text-violet-300 border-violet-400/50",
  legendary: "text-amber-300 border-amber-400/50",
};

export function FigurineCard({ fig, serial, children }: { fig?: Figurine; serial?: number; children?: React.ReactNode }) {
  if (!fig) return null;
  return (
    <GlassCard className={`p-3 border ${RARITY_STYLES[fig.rarity] || RARITY_STYLES.common}`}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center overflow-hidden shrink-0">
          {fig.image_url ? <img src={fig.image_url} alt={fig.name} className="w-full h-full object-cover" /> : <Gem className="w-6 h-6 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{fig.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {fig.rarity}{serial ? ` · #${serial}` : ""}{fig.description ? ` · ${fig.description}` : ""}
          </p>
        </div>
        {children}
      </div>
    </GlassCard>
  );
}

/** Public showcase of a user's collectibles (used on profiles). */
export function FigurineShowcase({ userId }: { userId: string }) {
  const [items, setItems] = useState<FigurineItem[]>([]);
  useEffect(() => {
    supabase.from("figurine_items").select("*, figurines(*)").eq("owner_id", userId).eq("showcased", true)
      .then(({ data }) => setItems((data as any) || []));
  }, [userId]);
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Gem className="w-4 h-4 text-primary" /> Collectibles</h3>
      {items.map(i => <FigurineCard key={i.id} fig={i.figurines} serial={i.serial} />)}
    </div>
  );
}

/** Official built-in mini-app: collection, P2P marketplace with escrow, and gifting. */
export function FigurinesView({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"market" | "collection" | "orders">("market");
  const [figurines, setFigurines] = useState<Figurine[]>([]);
  const [myItems, setMyItems] = useState<FigurineItem[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [giftItem, setGiftItem] = useState<FigurineItem | null>(null);
  const [giftHandle, setGiftHandle] = useState("");
  const [sellItem, setSellItem] = useState<FigurineItem | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) loadAll(); }, [open, user]);

  const loadAll = async () => {
    const [figs, items, lis, ord] = await Promise.all([
      supabase.from("figurines").select("*").order("created_at", { ascending: false }),
      user ? supabase.from("figurine_items").select("*, figurines(*)").eq("owner_id", user.id) : Promise.resolve({ data: [] } as any),
      supabase.from("marketplace_listings").select("*").eq("status", "active"),
      user ? supabase.from("escrow_orders").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [] } as any),
    ]);
    setFigurines((figs.data as Figurine[]) || []);
    setMyItems((items.data as any) || []);
    setListings((lis.data as Listing[]) || []);
    setOrders((ord.data as Order[]) || []);
  };

  const figById = (id: string) => figurines.find(f => f.id === id);

  const listForSale = async () => {
    if (!user || !sellItem) return;
    const price = parseFloat(sellPrice);
    if (!price || price <= 0) { toast({ title: "Error", description: "Enter a valid price", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await supabase.from("marketplace_listings").insert({ item_id: sellItem.id, seller_id: user.id, price });
    setBusy(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Listed on the marketplace" });
    setSellItem(null); setSellPrice("");
    loadAll();
  };

  /** Escrow: buyer funds are held until delivery is confirmed. */
  const buyWithEscrow = async (listing: Listing) => {
    if (!user) return;
    if (listing.seller_id === user.id) { toast({ title: "This is your own listing" }); return; }
    setBusy(true);
    const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    const balance = Number(wallet?.balance ?? 0);
    if (balance < Number(listing.price)) {
      setBusy(false);
      toast({ title: "Insufficient balance", description: "Top up your wallet to buy this item", variant: "destructive" });
      return;
    }
    const { error: orderErr } = await supabase.from("escrow_orders").insert({
      listing_id: listing.id, buyer_id: user.id, seller_id: listing.seller_id, amount: listing.price, status: "held",
    });
    if (orderErr) { setBusy(false); toast({ title: "Error", description: orderErr.message, variant: "destructive" }); return; }
    await supabase.from("wallets").update({ balance: balance - Number(listing.price) }).eq("user_id", user.id);
    setBusy(false);
    toast({ title: "Funds held in escrow", description: "Released to the seller once you confirm delivery" });
    loadAll();
  };

  const confirmDelivery = async (order: Order) => {
    if (!user) return;
    setBusy(true);
    const listing = listings.find(l => l.id === order.listing_id);
    const { data: sellerWallet } = await supabase.from("wallets").select("balance").eq("user_id", order.seller_id).maybeSingle();
    await supabase.from("wallets").update({ balance: Number(sellerWallet?.balance ?? 0) + Number(order.amount) }).eq("user_id", order.seller_id);
    await supabase.from("escrow_orders").update({ status: "released" }).eq("id", order.id);
    if (listing) {
      await supabase.from("marketplace_listings").update({ status: "sold" }).eq("id", listing.id);
      await supabase.from("figurine_items").update({ owner_id: order.buyer_id }).eq("id", listing.item_id);
    }
    setBusy(false);
    toast({ title: "Delivery confirmed", description: "Escrow released to the seller" });
    loadAll();
  };

  const cancelOrder = async (order: Order) => {
    if (!user) return;
    setBusy(true);
    const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", order.buyer_id).maybeSingle();
    await supabase.from("wallets").update({ balance: Number(wallet?.balance ?? 0) + Number(order.amount) }).eq("user_id", order.buyer_id);
    await supabase.from("escrow_orders").update({ status: "refunded" }).eq("id", order.id);
    setBusy(false);
    toast({ title: "Order cancelled", description: "Escrow refunded to the buyer" });
    loadAll();
  };

  const gift = async () => {
    if (!user || !giftItem) return;
    const handle = giftHandle.replace(/^@/, "").toLowerCase().trim();
    if (!handle) return;
    setBusy(true);
    const { data: target } = await supabase.from("profiles").select("user_id").eq("username", handle).maybeSingle();
    if (!target) { setBusy(false); toast({ title: "User not found", description: `No user @${handle}`, variant: "destructive" }); return; }
    const { error } = await supabase.from("figurine_items").update({ owner_id: target.user_id }).eq("id", giftItem.id);
    setBusy(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Gift sent", description: `Figurine transferred to @${handle}` });
    setGiftItem(null); setGiftHandle("");
    loadAll();
  };

  const toggleShowcase = async (item: FigurineItem) => {
    await supabase.from("figurine_items").update({ showcased: !item.showcased }).eq("id", item.id);
    loadAll();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-screen !h-[100dvh] !max-w-none !max-h-none !rounded-none glass-card border-primary/30 overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glow"><Gem className="w-5 h-5 text-primary" /> Flame Collectibles</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted/30 border border-border">
          {([["market", "Marketplace", Store], ["collection", "My collection", Package], ["orders", "Escrow", ShieldCheck]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-md text-[11px] font-semibold transition-colors ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {tab === "market" && (
          <div className="space-y-2">
            {listings.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No active listings yet.</p>
            ) : listings.map(l => {
              const item = myItems.find(i => i.id === l.item_id);
              const fig = item?.figurines || figurines.find(f => myItems.some(i => i.id === l.item_id && i.figurine_id === f.id));
              return (
                <GlassCard key={l.id} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center"><Gem className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{fig?.name || "Collectible"}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Tag className="w-3 h-3" />{l.price} FLM</p>
                  </div>
                  <FlameButton size="sm" disabled={busy} onClick={() => buyWithEscrow(l)}>Buy (escrow)</FlameButton>
                </GlassCard>
              );
            })}
            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Every purchase is protected: funds stay in escrow until the buyer confirms delivery.
            </p>
          </div>
        )}

        {tab === "collection" && (
          <div className="space-y-2">
            {myItems.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">You don't own any figurines yet.</p>
            ) : myItems.map(i => (
              <FigurineCard key={i.id} fig={i.figurines} serial={i.serial}>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleShowcase(i)} className={`p-2 rounded-lg ${i.showcased ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"}`} title="Show on profile">
                    <Package className="w-4 h-4" />
                  </button>
                  <button onClick={() => setSellItem(i)} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground" title="Sell"><Tag className="w-4 h-4" /></button>
                  <button onClick={() => setGiftItem(i)} className="p-2 rounded-lg hover:bg-primary/10 text-primary" title="Gift"><Gift className="w-4 h-4" /></button>
                </div>
              </FigurineCard>
            ))}
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-2">
            {orders.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No escrow orders.</p>
            ) : orders.map(o => (
              <GlassCard key={o.id} className="p-3 flex items-center gap-3">
                <ShieldCheck className={`w-5 h-5 ${o.status === "held" ? "text-amber-300" : o.status === "released" ? "text-emerald-400" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{o.amount} FLM · {o.status}</p>
                  <p className="text-[11px] text-muted-foreground">{o.buyer_id === user?.id ? "You are the buyer" : "You are the seller"}</p>
                </div>
                {o.status === "held" && o.buyer_id === user?.id && (
                  <div className="flex gap-1">
                    <button onClick={() => confirmDelivery(o)} disabled={busy} className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400" title="Confirm delivery"><Check className="w-4 h-4" /></button>
                    <button onClick={() => cancelOrder(o)} disabled={busy} className="p-2 rounded-lg bg-destructive/15 text-destructive" title="Cancel & refund"><X className="w-4 h-4" /></button>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}

        {/* Sell dialog */}
        <Dialog open={!!sellItem} onOpenChange={o => !o && setSellItem(null)}>
          <DialogContent className="glass-card border-primary/30 max-w-sm">
            <DialogHeader><DialogTitle>List for sale</DialogTitle></DialogHeader>
            <FlameInput placeholder="Price in FLM" value={sellPrice} onChange={e => setSellPrice(e.target.value)} inputMode="decimal" />
            <FlameButton onClick={listForSale} disabled={busy} className="w-full">List item</FlameButton>
          </DialogContent>
        </Dialog>

        {/* Gift dialog */}
        <Dialog open={!!giftItem} onOpenChange={o => !o && setGiftItem(null)}>
          <DialogContent className="glass-card border-primary/30 max-w-sm">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Gift className="w-4 h-4 text-primary" /> Gift figurine</DialogTitle></DialogHeader>
            <FlameInput placeholder="@username" value={giftHandle} onChange={e => setGiftHandle(e.target.value)} />
            <FlameButton onClick={gift} disabled={busy || !giftHandle.trim()} className="w-full">Send gift</FlameButton>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
