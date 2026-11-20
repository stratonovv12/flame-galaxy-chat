export const DOCK_VISIBLE_SLOTS = 3;
export const APP_TABS = ["feed", "messages", "ai", "marketplace", "workshop", "profile", "settings"] as const;
export type AppTab = typeof APP_TABS[number];
export const tabPaths: Record<AppTab, string> = {
  feed: "/", messages: "/chats", ai: "/ai", marketplace: "/marketplace",
  workshop: "/workshop", profile: "/profile", settings: "/settings",
};
export function getActiveTab(path: string): AppTab | null {
  if (path === "/" || path === "/feed" || path.startsWith("/post/") || path.startsWith("/p/")) return "feed";
  return APP_TABS.find(tab => tab !== "feed" && (path === tabPaths[tab] || path.startsWith(`${tabPaths[tab]}/`))) ?? null;
}
export function safeReturnPath(path: string | null): string {
  return path?.startsWith("/") && !path.startsWith("//") && !path.startsWith("/auth") ? path : "/";
}
export const postPath = (id: string) => `/post/${encodeURIComponent(id)}`;
export const profilePath = (username: string) => `/profile/${encodeURIComponent(username.replace(/^@/, ""))}`;