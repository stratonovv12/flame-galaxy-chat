export type MarketCategory = "all" | "rare" | "limited" | "cyberpunk" | "animated";
export function matchesMarketCategory(item: { rarity: string; name: string; description: string | null; image_url: string | null; supply: number }, category: MarketCategory) {
  if (category === "all") return true;
  if (category === "rare") return ["rare", "epic", "legendary"].includes(item.rarity.toLowerCase());
  if (category === "limited") return item.supply > 0;
  const metadata = `${item.rarity} ${item.name} ${item.description ?? ""}`;
  if (category === "cyberpunk") return /cyberpunk|киберпанк/i.test(metadata);
  return /animated|анимирован/i.test(metadata) || /\.(gif|webm|mp4|mov)(\?|$)/i.test(item.image_url ?? "");
}
