import { describe, expect, it } from "vitest";
import { callDuration, canStartTimer, setAudioMuted } from "@/lib/call-state";
import { APP_TABS, DOCK_VISIBLE_SLOTS, getActiveTab, postPath, profilePath, safeReturnPath } from "@/lib/navigation";
import { matchesMarketCategory } from "@/lib/marketplace";

describe("call connection rules", () => {
  it("never runs the duration before explicit acceptance and peer connection", () => {
    expect(canStartTimer(false, "connected")).toBe(false);
    expect(canStartTimer(true, "connecting")).toBe(false);
    expect(canStartTimer(true, "connected")).toBe(true);
  });
  it("shows no duration during calling or ringing", () => {
    expect(callDuration("calling", null, 10_000)).toBe(0);
    expect(callDuration("ringing", 1000, 10_000)).toBe(0);
  });
  it("starts the timer from the actual connected moment", () => {
    expect(callDuration("connected", 5000, 8000)).toBe(3);
    expect(callDuration("ended", 5000, 8000)).toBe(0);
  });
  it("mute disables every local microphone track and unmute restores them", () => {
    const tracks = [{ enabled: true }, { enabled: true }];
    const stream = { getAudioTracks: () => tracks as MediaStreamTrack[] };
    setAudioMuted(stream, true);
    expect(tracks.map(t => t.enabled)).toEqual([false, false]);
    setAudioMuted(stream, false);
    expect(tracks.map(t => t.enabled)).toEqual([true, true]);
  });
});
describe("navigation and shared destinations", () => {
  it("provides the seven requested tabs with exactly three visible slots", () => {
    expect(DOCK_VISIBLE_SLOTS).toBe(3);
    expect(APP_TABS).toEqual(["feed", "messages", "ai", "marketplace", "workshop", "profile", "settings"]);
  });
  it("preserves canonical and legacy post destinations", () => {
    expect(postPath("123")).toBe("/post/123");
    expect(getActiveTab("/post/123")).toBe("feed");
    expect(getActiveTab("/p/123")).toBe("feed");
    expect(profilePath("@alice")).toBe("/profile/alice");
  });
  it("returns to the shared destination after login without external redirects", () => {
    expect(safeReturnPath("/post/123")).toBe("/post/123");
    expect(safeReturnPath("/profile/alice")).toBe("/profile/alice");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("https://evil.example")).toBe("/");
  });
});
describe("marketplace categorization", () => {
  const item = { rarity: "rare", name: "Cyberpunk Flame", description: null, image_url: "/coin.gif", supply: 20 };
  it("recognizes rare collectibles", () => { expect(matchesMarketCategory(item,"rare")).toBe(true); expect(matchesMarketCategory({...item,rarity:"common"},"rare")).toBe(false); });
  it("recognizes finite supply", () => { expect(matchesMarketCategory(item,"limited")).toBe(true); expect(matchesMarketCategory({...item,supply:0},"limited")).toBe(false); });
  it("recognizes cyberpunk and animated items from real metadata", () => { expect(matchesMarketCategory(item,"cyberpunk")).toBe(true); expect(matchesMarketCategory(item,"animated")).toBe(true); expect(matchesMarketCategory({...item,image_url:"/coin.png"},"animated")).toBe(false); });
});