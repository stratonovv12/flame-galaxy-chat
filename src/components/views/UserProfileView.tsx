import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { FlameButton } from "@/components/ui/FlameButton";
import { FlameInput } from "@/components/ui/FlameInput";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserBadge } from "@/components/ui/UserBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ArrowLeft, MessageCircle, Calendar, Hash, Package, Lock,
  Gift, ArrowLeftRight, ShoppingBag, AlertTriangle, DollarSign, X, Heart, Image as ImageIcon
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  user_id: string;
  created_at: string;
  display_name: string | null;
  inventory_visibility?: string;
  steam_trade_url?: string | null;
}

interface Post {
  id: string;
  content: string;
  media_url: string | null;
  created_at: string;
  channel_id: string;
  channel_name?: string;
}

interface SocialPost {
  id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string;
  likes_count: number;
}

interface InventoryItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  acquired_at: string;
}

interface MarketListing {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number;
  status: string;
}

interface UserProfileViewProps {
  userId: string;
  onBack: () => void;
  onStartChat: (userId: string) => void;
}

export function UserProfileView({ userId, onBack, onStartChat }: UserProfileViewProps) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [myInventory, setMyInventory] = useState<InventoryItem[]>([]);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"posts" | "social" | "inventory" | "shop">("social");
  const [inventoryAccessible, setInventoryAccessible] = useState(false);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);

  // Gift modal
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftItem, setGiftItem] = useState<string | null>(null);
  const [giftLoading, setGiftLoading] = useState(false);

  // Trade modal
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeMyItem, setTradeMyItem] = useState<string | null>(null);
  const [tradeTheirItem, setTradeTheirItem] = useState<string | null>(null);
  const [tradeBalance, setTradeBalance] = useState("");
  const [tradeLoading, setTradeLoading] = useState(false);

  // Buy loading
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const hasSteamUrl = myProfile?.steam_trade_url && myProfile.steam_trade_url.trim().length > 0;
  const isOwnProfile = user?.id === userId;

  useEffect(() => { fetchUserData(); }, [userId]);

  const fetchUserData = async () => {
    setLoading(true);

    // Profile
    const { data: profileData } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    setProfile(profileData as Profile | null);

    // My profile
    if (user) {
      const { data: mp } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      setMyProfile(mp as Profile | null);
    }

    // Channel posts
    const { data: postsData } = await supabase.from("posts").select("id, content, media_url, created_at, channel_id")
      .eq("author_id", userId).not("media_url", "is", null)
      .order("created_at", { ascending: false }).limit(20);

    if (postsData && postsData.length > 0) {
      const channelIds = [...new Set(postsData.map((p) => p.channel_id))] as string[];
      const { data: channelsData } = await supabase.from("channels").select("id, name").in("id", channelIds);
      const channelMap = new Map(channelsData?.map((c) => [c.id, c.name]) || []);
      setPosts(postsData.map((p) => ({ ...p, channel_name: channelMap.get(p.channel_id) || "Канал" })));
    } else {
      setPosts([]);
    }

    // Social feed (Instagram-style profile_posts) — visible to everyone
    const { data: socialData } = await supabase
      .from("profile_posts")
      .select("id, caption, image_url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (socialData && socialData.length > 0) {
      const postIds = socialData.map(p => p.id);
      const { data: likesData } = await supabase
        .from("post_likes")
        .select("post_id")
        .in("post_id", postIds);
      const likeCountMap = new Map<string, number>();
      (likesData || []).forEach(l => likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) || 0) + 1));
      setSocialPosts(socialData.map(p => ({ ...p, likes_count: likeCountMap.get(p.id) || 0 })));
    } else {
      setSocialPosts([]);
    }

    // Listings
    const { data: listData } = await supabase.from("marketplace_listings").select("*")
      .eq("seller_id", userId).eq("status", "active").order("created_at", { ascending: false });
    setListings((listData || []) as MarketListing[]);

    // My inventory
    if (user) {
      const { data: myInvData } = await supabase.from("user_inventory").select("id, title, description, image_url, acquired_at")
        .eq("owner_id", user.id).order("acquired_at", { ascending: false });
      setMyInventory((myInvData || []) as InventoryItem[]);
    }

    // Inventory visibility
    const visibility = profileData?.inventory_visibility || "public";
    const canSee = user?.id === userId || visibility === "public";
    setInventoryAccessible(canSee);

    if (canSee) {
      const { data: invData } = await supabase
        .from("user_inventory").select("id, title, description, image_url, acquired_at")
        .eq("owner_id", userId).order("acquired_at", { ascending: false });
      setInventory((invData as InventoryItem[]) || []);
    }

    setLoading(false);
  };

  const handleGift = async () => {
    if (!giftItem || !user || !profile?.username) return;
    setGiftLoading(true);
    const { data } = await supabase.rpc("gift_item", {
      _item_id: giftItem,
      _from_user: user.id,
      _to_username: profile.username,
    });
    setGiftLoading(false);
    if ((data as any)?.error) {
      toast({ title: t("error"), description: (data as any).error, variant: "destructive" });
    } else {
      toast({ title: t("giftSent"), description: `${t("itemSentTo")} @${profile.username}` });
      setGiftOpen(false);
      setGiftItem(null);
      fetchUserData();
    }
  };

  const handleTrade = async () => {
    if (!user || !profile) return;
    if (!tradeMyItem && !tradeTheirItem) {
      toast({ title: t("error"), description: t("selectAtLeastOneItem"), variant: "destructive" });
      return;
    }
    setTradeLoading(true);
    const { error } = await supabase.from("trade_offers").insert({
      sender_id: user.id,
      receiver_id: userId,
      sender_item_id: tradeMyItem || null,
      receiver_item_id: tradeTheirItem || null,
      sender_balance_offer: parseFloat(tradeBalance) || 0,
    });
    setTradeLoading(false);
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("tradeSent"), description: t("awaitResponse") });
      setTradeOpen(false);
      setTradeMyItem(null);
      setTradeTheirItem(null);
      setTradeBalance("");
    }
  };

  const handleBuy = async (listing: MarketListing) => {
    if (!user) return;
    setBuyingId(listing.id);
    const { data } = await supabase.rpc("buy_listing", {
      _listing_id: listing.id,
      _buyer_id: user.id,
    });
    setBuyingId(null);
    if ((data as any)?.error) {
      toast({ title: t("error"), description: (data as any).error, variant: "destructive" });
    } else {
      toast({ title: t("bought"), description: `${listing.title} — $${listing.price} (${t("commission")} 5%)` });
      fetchUserData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground mb-4">
          <ArrowLeft className="w-5 h-5" /> {t("back")}
        </button>
        <GlassCard className="text-center py-12">
          <p className="text-muted-foreground">{t("profileNotFound")}</p>
        </GlassCard>
      </div>
    );
  }

  const showShopTab = listings.length > 0 && !isOwnProfile;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground">
        <ArrowLeft className="w-5 h-5" /> {t("back")}
      </button>

      {/* Profile Card */}
      <GlassCard className="p-8 text-center" glow>
        <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} size="xl" className="mx-auto mb-4 neon-glow" />
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <h2 className="text-xl font-bold">{profile.display_name || profile.username || t("noName")}</h2>
          <UserBadge userId={userId} />
        </div>
        {profile.username && <p className="text-sm text-primary/80 mb-2">@{profile.username.replace(/^@/, "")}</p>}
        {profile.bio && <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">{profile.bio}</p>}
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 mb-4">
          <Calendar className="w-4 h-4" />
          {t("inFlameSince")} {new Date(profile.created_at).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}
        </p>

        {/* Action buttons */}
        {!isOwnProfile && (
          <div className="space-y-2">
            <FlameButton onClick={() => onStartChat(userId)} className="w-full max-w-xs mx-auto">
              <MessageCircle className="w-4 h-4 mr-2" /> {t("writeToUser")}
            </FlameButton>

            {!hasSteamUrl && (
              <div className="flex items-center justify-center gap-2 text-xs text-yellow-400/80 mt-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{t("setSteamUrlForTrade")}</span>
              </div>
            )}

            <div className="flex gap-2 max-w-xs mx-auto">
              <FlameButton
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!hasSteamUrl}
                onClick={() => setGiftOpen(true)}
              >
                <Gift className="w-4 h-4 mr-1" /> {t("sendGift")}
              </FlameButton>
              <FlameButton
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!hasSteamUrl}
                onClick={() => setTradeOpen(true)}
              >
                <ArrowLeftRight className="w-4 h-4 mr-1" /> {t("proposeTrade")}
              </FlameButton>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button onClick={() => setActiveTab("social")}
          className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "social" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <span className="flex items-center justify-center gap-1.5"><ImageIcon className="w-4 h-4" /> {socialPosts.length}</span>
        </button>
        <button onClick={() => setActiveTab("posts")}
          className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "posts" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <span className="flex items-center justify-center gap-1.5"><Hash className="w-4 h-4" /> {posts.length}</span>
        </button>
        <button onClick={() => setActiveTab("inventory")}
          className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "inventory" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          <span className="flex items-center justify-center gap-1.5"><Package className="w-4 h-4" /> {t("inventoryTab")}</span>
        </button>
        {showShopTab && (
          <button onClick={() => setActiveTab("shop")}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "shop" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <span className="flex items-center justify-center gap-1.5"><ShoppingBag className="w-4 h-4" /> {t("forSale")}</span>
          </button>
        )}
      </div>

      {/* Social feed (Instagram-style profile_posts) */}
      {activeTab === "social" && (
        <div>
          {socialPosts.length === 0 ? (
            <GlassCard className="text-center py-8">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">{lang === "ru" ? "Пока нет постов" : "No posts yet"}</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {socialPosts.map((post) => (
                <div key={post.id} className="relative aspect-square overflow-hidden rounded-md bg-muted/30 cursor-pointer group"
                  onClick={() => post.image_url && window.open(post.image_url, "_blank")}>
                  {post.image_url && (
                    <img src={post.image_url} alt={post.caption || ""} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <div className="flex items-center gap-1 text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-semibold">
                      <Heart className="w-4 h-4 fill-white" /> {post.likes_count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Posts tab */}
      {activeTab === "posts" && (
        <div>
          {posts.length === 0 ? (
            <GlassCard className="text-center py-8"><p className="text-muted-foreground">{t("noMediaPosts")}</p></GlassCard>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {posts.map((post) => (
                <GlassCard key={post.id} className="p-2 cursor-pointer" onClick={() => post.media_url && window.open(post.media_url, "_blank")}>
                  {post.media_url && (
                    post.media_url.match(/\.(mp4|webm|mov)/) ? (
                      <video src={post.media_url} className="w-full aspect-square rounded-lg object-cover" />
                    ) : (
                      <img src={post.media_url} alt="" className="w-full aspect-square rounded-lg object-cover" />
                    )
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 px-1">
                    <Hash className="w-3 h-3" /><span className="truncate">{post.channel_name}</span>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inventory tab */}
      {activeTab === "inventory" && (
        <div>
          {!inventoryAccessible ? (
            <GlassCard className="text-center py-12">
              <Lock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">{t("inventoryHiddenByOwner")}</p>
            </GlassCard>
          ) : inventory.length === 0 ? (
            <GlassCard className="text-center py-8">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">{t("inventoryEmpty")}</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {inventory.map((item) => (
                <GlassCard key={item.id} className="overflow-hidden">
                  {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-28 object-cover" />}
                  <div className="p-3">
                    <h4 className="font-semibold text-sm">{item.title}</h4>
                    {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shop tab - listings for sale */}
      {activeTab === "shop" && (
        <div className="grid grid-cols-2 gap-3">
          {listings.map((listing) => (
            <GlassCard key={listing.id} className="overflow-hidden">
              {listing.image_url && <img src={listing.image_url} alt={listing.title} className="w-full h-28 object-cover" />}
              <div className="p-3 space-y-2">
                <h4 className="font-semibold text-sm">{listing.title}</h4>
                <p className="text-primary font-bold text-sm">${listing.price.toFixed(2)}</p>
                <FlameButton
                  size="sm"
                  className="w-full text-xs"
                  disabled={!hasSteamUrl || buyingId === listing.id}
                  onClick={() => handleBuy(listing)}
                >
                  {buyingId === listing.id ? "..." : <><ShoppingBag className="w-3 h-3 mr-1" /> {t("buy")}</>}
                </FlameButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Gift Modal */}
      {giftOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setGiftOpen(false)}>
          <GlassCard className="w-full max-w-sm p-6 space-y-4" onClick={(e: React.MouseEvent) => e.stopPropagation()} glow>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-primary" /> {t("giftSkin")}</h3>
              <button onClick={() => setGiftOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">{t("selectItemFor")} @{profile.username}</p>
            {myInventory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("yourInventoryEmpty")}</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {myInventory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setGiftItem(item.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      giftItem === item.id ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-primary/40"
                    }`}
                  >
                    {item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 rounded object-cover" />}
                    <span className="text-sm font-medium text-left flex-1">{item.title}</span>
                  </button>
                ))}
              </div>
            )}
            <FlameButton onClick={handleGift} disabled={!giftItem || giftLoading} className="w-full">
              {giftLoading ? t("sending") : t("giftBtn")}
            </FlameButton>
          </GlassCard>
        </div>
      )}

      {/* Trade Modal */}
      {tradeOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setTradeOpen(false)}>
          <GlassCard className="w-full max-w-sm p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e: React.MouseEvent) => e.stopPropagation()} glow>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-primary" /> {t("proposeTrade")}</h3>
              <button onClick={() => setTradeOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {/* My item */}
            <div>
              <p className="text-sm font-medium mb-2">{t("yourItem")}:</p>
              {myInventory.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("inventoryEmpty")}</p>
              ) : (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {myInventory.map((item) => (
                    <button key={item.id} onClick={() => setTradeMyItem(tradeMyItem === item.id ? null : item.id)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${
                        tradeMyItem === item.id ? "border-primary bg-primary/10" : "border-border bg-muted/20"
                      }`}>
                      {item.image_url && <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="flex-1 text-left">{item.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Their item */}
            {inventoryAccessible && inventory.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">{t("theirItem")} @{profile.username}:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {inventory.map((item) => (
                    <button key={item.id} onClick={() => setTradeTheirItem(tradeTheirItem === item.id ? null : item.id)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${
                        tradeTheirItem === item.id ? "border-primary bg-primary/10" : "border-border bg-muted/20"
                      }`}>
                      {item.image_url && <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="flex-1 text-left">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Balance offer */}
            <FlameInput label={t("balanceExtra")} placeholder="0.00" type="number" value={tradeBalance} onChange={(e) => setTradeBalance(e.target.value)} />
            <FlameButton onClick={handleTrade} disabled={tradeLoading} className="w-full">
              {tradeLoading ? t("sending") : t("sendOffer")}
            </FlameButton>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
