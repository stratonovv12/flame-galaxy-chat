import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { FlameInput } from "@/components/ui/FlameInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Coins, Gift, Tag, Package, Check, X, Loader2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FlameBadge } from "@/components/ui/FlameBadge";
import flameLogoAsset from "@/assets/flame-mark.png.asset.json";
const flameLogo = flameLogoAsset.url;
import { matchesMarketCategory, type MarketCategory } from "@/lib/marketplace";

export interface Figurine { id: string; name: string; description: string | null; image_url: string | null; rarity: string; supply: number; price: number; }
export interface FigurineItem { id: string; figurine_id: string; owner_id: string; serial: number; showcased: boolean; figurines?: Figurine; }
interface Listing { id: string; item_id: string; seller_id: string; price: number; status: string; figurine_items: { serial: number; figurines: Figurine | null } | null; }
interface Order { id: string; listing_id: string; buyer_id: string; seller_id: string; amount: number; status: string; }
interface MarketSelection { figurine: Figurine; listing?: Listing; item?: FigurineItem; }

function CollectibleArt({ figurine, className = "" }: { figurine: Figurine; className?: string }) {
  const animatedVideo = /\.(mp4|webm|mov)(\?|$)/i.test(figurine.image_url ?? "");
  return animatedVideo ? <video src={figurine.image_url ?? undefined} autoPlay loop muted playsInline className={`object-contain ${className}`} /> : <img src={figurine.image_url || flameLogo} alt={figurine.name} loading="lazy" className={`object-contain ${className}`} />;
}
export function FigurineCard({ fig, serial, children }: { fig?: Figurine; serial?: number; children?: React.ReactNode }) {
  if (!fig) return null;
  return <div className="market-item border border-border rounded-lg p-3 flex items-center gap-3"><CollectibleArt figurine={fig} className="w-12 h-12 shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{fig.name}</p><p className="text-xs text-muted-foreground">{fig.rarity}{serial ? ` · #${serial}` : ""}</p></div>{children}</div>;
}
export function FigurineShowcase({ userId }: { userId: string }) {
  const [items, setItems] = useState<FigurineItem[]>([]);
  const { t } = useLanguage();
  useEffect(() => {
    const load = async () => { const { data } = await supabase.from("figurine_items").select("*, figurines(*)").eq("owner_id", userId).eq("showcased", true); setItems((data as FigurineItem[]) ?? []); };
    void load();
    const channel = supabase.channel(`showcase-${userId}-${crypto.randomUUID()}`).on("postgres_changes", { event: "*", schema: "public", table: "figurine_items" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);
  if (!items.length) return null;
  return <section className="space-y-2"><h3 className="text-sm font-semibold flex gap-2 items-center"><Package className="w-4 h-4 text-primary" />{t("marketInventory")}</h3>{items.map(item => <FigurineCard key={item.id} fig={item.figurines} serial={item.serial} />)}</section>;
}
export function FigurinesView({ open, onOpenChange, embedded = false }: { open: boolean; onOpenChange: (open: boolean) => void; embedded?: boolean }) {
  const { user } = useAuth(); const { t } = useLanguage();
  const [tab, setTab] = useState<"market" | "collection" | "orders">("market");
  const [category, setCategory] = useState<MarketCategory>("all");
  const [figurines, setFigurines] = useState<Figurine[]>([]); const [items, setItems] = useState<FigurineItem[]>([]);
  const [listings, setListings] = useState<Listing[]>([]); const [orders, setOrders] = useState<Order[]>([]);
  const [balance, setBalance] = useState(0); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<MarketSelection | null>(null); const [recipient, setRecipient] = useState(""); const [price, setPrice] = useState("");
  const [depositOpen, setDepositOpen] = useState(false); const [depositAmount, setDepositAmount] = useState("");
  const load = async () => {
    if (!user) return;
    const [catalog, inventory, market, transactions, wallet] = await Promise.all([
      supabase.from("figurines").select("*").order("created_at", { ascending: false }),
      supabase.from("figurine_items").select("*, figurines(*)").eq("owner_id", user.id),
      supabase.from("marketplace_listings").select("*, figurine_items(serial, figurines(*))").eq("status", "active"),
      supabase.from("escrow_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);
    const error = catalog.error || inventory.error || market.error || transactions.error || wallet.error;
    if (error) toast({ title: t("error"), description: error.message, variant: "destructive" });
    setFigurines(catalog.data ?? []); setItems((inventory.data as FigurineItem[]) ?? []); setListings((market.data as Listing[]) ?? []); setOrders(transactions.data ?? []); setBalance(Number(wallet.data?.balance ?? 0)); setLoading(false);
  };
  useEffect(() => {
    if (!open || !user) return;
    void load();
    const channel = supabase.channel(`market-${user.id}-${crypto.randomUUID()}`);
    for (const table of ["figurines", "figurine_items", "marketplace_listings", "escrow_orders", "wallets"]) channel.on("postgres_changes", { event: "*", schema: "public", table }, () => void load());
    channel.subscribe(); return () => { void supabase.removeChannel(channel); };
  }, [open, user?.id]);
  const action = async (kind: string, id: string, target?: string, amount?: number) => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("market_action", { _action: kind, _id: id, _recipient: target, _price: amount });
    setBusy(false);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: kind === "gift" ? t("marketGiftSent") : kind === "list" ? t("marketListed") : t("settingsUpdated") });
    setSelected(null); setRecipient(""); setPrice(""); void load();
  };
  const requestDeposit = async () => {
    const amount = Number(depositAmount);
    if (!user || !Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    const { error } = await supabase.from("deposit_requests").insert({ user_id: user.id, amount, type: "manual", status: "pending" });
    setBusy(false);
    if (error) { toast({ title: t("error"), description: error.message, variant: "destructive" }); return; }
    setDepositOpen(false); toast({ title: t("marketRequestDeposit"), description: t("marketDepositPending") });
  };
  const categories = [["all", t("marketAll")], ["rare", t("marketRare")], ["limited", t("marketLimited")], ["cyberpunk", t("marketCyberpunk")], ["animated", t("marketAnimated")]] as const;
  const tiles: MarketSelection[] = [...listings.flatMap(listing => listing.figurine_items?.figurines ? [{ figurine: listing.figurine_items.figurines, listing }] : []), ...figurines.map(figurine => ({ figurine }))].filter(tile => matchesMarketCategory(tile.figurine, category));
  const content = <div className="min-w-0 space-y-5 p-4 max-w-4xl mx-auto">
    <header className="flex gap-3 items-center">
      <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label={t("back")}><ArrowLeft /></Button>
      <div className="flex-1 min-w-0"><h1 className="text-xl font-semibold flex gap-2 items-center">{t("marketTitle")}<FlameBadge size={18} /></h1><p className="text-xs text-muted-foreground">{t("marketCatalog")}</p></div>
      <Button variant="secondary" size="sm" onClick={() => setDepositOpen(true)} aria-label={t("marketRequestDeposit")}><Coins /><span className="tabular-nums">{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><Plus className="w-3 h-3" /></Button>
    </header>
    <div className="flex gap-2 border-b border-border pb-3">{([["market",t("marketCatalog")],["collection",t("marketInventory")],["orders",t("marketOrders")]] as const).map(([key,label]) => <Button key={key} variant={tab === key ? "secondary" : "ghost"} size="sm" onClick={() => setTab(key)} className={tab === key ? "text-primary" : "text-muted-foreground"}>{label}</Button>)}</div>
    {tab === "market" && <>
      <div className="flex flex-wrap gap-1.5">{categories.map(([key,label]) => <Button key={key} size="sm" variant={category === key ? "default" : "secondary"} className="rounded-full px-3 text-xs" onClick={() => setCategory(key)}>{label}</Button>)}</div>
      {loading ? <Loader2 className="mx-auto my-12 animate-spin text-primary" /> : !tiles.length ? <div className="py-16 text-center"><Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-sm text-muted-foreground">{t("marketEmpty")}</p></div> : <div className="grid grid-cols-2 gap-3">{tiles.map(tile => <Button key={tile.listing?.id ?? tile.figurine.id} variant="ghost" onClick={() => setSelected(tile)} className="market-item h-auto min-w-0 p-3 rounded-lg border border-border flex flex-col items-stretch gap-3 hover:bg-muted">
        <div className="aspect-square flex items-center justify-center overflow-hidden"><CollectibleArt figurine={tile.figurine} className="w-full h-full" /></div>
        <div className="min-w-0 text-left"><span className="inline-flex text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5 mb-1">{tile.figurine.rarity}</span><p className="font-semibold text-sm truncate">{tile.figurine.name}</p><p className="text-xs text-muted-foreground mt-1 tabular-nums">{tile.listing?.price ?? tile.figurine.price} FLM{tile.listing ? ` · #${tile.listing.figurine_items?.serial}` : ""}</p></div>
      </Button>)}</div>}
    </>}
    {tab === "collection" && <div className="space-y-2">{!items.length ? <p className="text-sm text-muted-foreground py-12 text-center">{t("marketNoInventory")}</p> : items.map(item => <FigurineCard key={item.id} fig={item.figurines} serial={item.serial}><Button variant="ghost" size="icon" onClick={() => void action("showcase",item.id)} aria-label={t("profile")} className={item.showcased ? "text-primary" : "text-muted-foreground"}><Package /></Button><Button variant="ghost" size="icon" onClick={() => { if (item.figurines) setSelected({ figurine: item.figurines, item }); }} aria-label={t("giftCollectible")}><Gift /></Button></FigurineCard>)}</div>}
    {tab === "orders" && <div className="space-y-2">{!orders.length ? <p className="text-sm text-muted-foreground py-12 text-center">{t("marketNoOrders")}</p> : orders.map(order => <article key={order.id} className="p-3 rounded-lg border border-border bg-card flex gap-2 items-center"><div className="flex-1"><p className="text-sm font-semibold">{order.amount} FLM</p><p className="text-xs text-muted-foreground">{order.status}</p></div>{order.status === "held" && order.buyer_id === user?.id && <><Button variant="secondary" size="icon" disabled={busy} onClick={() => void action("confirm_order",order.id)} aria-label={t("confirm")}><Check /></Button><Button variant="destructive" size="icon" disabled={busy} onClick={() => void action("cancel_order",order.id)} aria-label={t("cancel")}><X /></Button></>}</article>)}</div>}
    <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><SheetContent side="bottom" className="rounded-t-2xl bg-card max-h-[85dvh] overflow-y-auto p-5"><SheetHeader><SheetTitle>{selected?.figurine.name}</SheetTitle></SheetHeader>{selected && <div className="max-w-md mx-auto space-y-4 mt-4">
      <CollectibleArt figurine={selected.figurine} className="w-full h-48" /><p className="text-sm text-muted-foreground">{selected.figurine.description}</p><div className="flex justify-between text-sm"><span className="text-primary">{selected.figurine.rarity}</span><span>{t("marketSupply")}: {selected.figurine.supply}</span></div>
      {selected.item ? <><FlameInput aria-label={t("marketRecipient")} placeholder={t("marketRecipient")} value={recipient} onChange={e => setRecipient(e.target.value)} /><Button className="w-full" disabled={busy || !recipient.trim()} onClick={() => void action("gift",selected.item?.id ?? "",recipient)}><Gift />{t("giftCollectible")}</Button><div className="flex gap-2"><FlameInput aria-label={t("marketPrice")} placeholder={t("marketPrice")} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /><Button variant="outline" disabled={busy || Number(price)<=0 || !price} onClick={() => void action("list",selected.item?.id ?? "",undefined,Number(price))}><Tag />{t("marketSell")}</Button></div></> : <><Button className="w-full" disabled={busy || selected.listing?.seller_id === user?.id} onClick={() => void action(selected.listing ? "buy_listing" : "buy_catalog",selected.listing?.id ?? selected.figurine.id)}>{busy && <Loader2 className="animate-spin" />}{t("marketBuy")} · {selected.listing?.price ?? selected.figurine.price} FLM</Button><p className="text-xs text-muted-foreground text-center">{selected.listing ? t("marketEscrowNotice") : t("marketGiftAfterPurchase")}</p></>}
    </div>}</SheetContent></Sheet>
    <Dialog open={depositOpen} onOpenChange={setDepositOpen}><DialogContent><DialogHeader><DialogTitle>{t("marketRequestDeposit")}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{t("marketDepositNotice")}</p><FlameInput aria-label={t("amount")} placeholder={t("amount")} inputMode="decimal" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /><Button disabled={busy || !Number.isFinite(Number(depositAmount)) || Number(depositAmount)<=0} onClick={() => void requestDeposit()}>{t("marketRequestDeposit")}</Button></DialogContent></Dialog>
  </div>;
  if (!open) return null;
  if (embedded) return content;
  return <div data-dock-obstruction="true" className="fixed inset-0 z-[80] bg-background overflow-y-auto">{content}</div>;
}
