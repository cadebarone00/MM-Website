import type { GolfTripNavigation } from "./golfTripNavigation";

/**
 * Trip Builder's first-time tour (the Learn screen's 3 quick swipes and the full slides) and the trip home's coach
 * marks: shown once per account on this device; Settings can show them again. Storage errors never throw; a blocked
 * storage still remembers for this session so the tour doesn't loop.
 */
export const TOUR_SEEN_KEY = "maroon.golfTripTour.seen";
export const TIPS_SEEN_KEY = "maroon.golfTripTips.seen";

type Store = Pick<Storage, "getItem" | "setItem">;
const memory = new Map<string, Set<string>>();
const defaultStore = (): Store | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };

function read(key: string, storage: Store | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}
function write(key: string, ids: Set<string>, storage: Store | null) {
  try { storage?.setItem(key, JSON.stringify([...ids])); } catch { /* blocked: the in-memory copy covers this session */ }
}

export function hasSeen(key: string, profileId: string, storage: Store | null = defaultStore()): boolean {
  return memory.get(key)?.has(profileId) === true || read(key, storage).has(profileId);
}
export function markSeen(key: string, profileId: string, storage: Store | null = defaultStore()) {
  (memory.get(key) ?? memory.set(key, new Set()).get(key)!).add(profileId);
  const ids = read(key, storage);
  ids.add(profileId);
  write(key, ids, storage);
}
export function clearSeen(key: string, profileId: string, storage: Store | null = defaultStore()) {
  memory.get(key)?.delete(profileId);
  const ids = read(key, storage);
  ids.delete(profileId);
  write(key, ids, storage);
}

/** One tour page: a real trip screen (sample data) in the inner phone, with an optional gold outline + note. */
export type TourPage = { title: string; body: string; navigation?: GolfTripNavigation; callout?: { box: [number, number, number, number]; text: string } };

export const QUICK_SWIPES: readonly TourPage[] = [
  { title: "Plan it in one place", body: "Dates, courses and who's coming, all on one trip.", navigation: { tab: "Home" } },
  { title: "Compete all trip long", body: "Teams, pairs or solo, with a live leaderboard.", navigation: { tab: "Golf" } },
  { title: "Score live", body: "Everyone enters scores on their phone as you play.", navigation: { tab: "Golf" } },
];

export const TOUR_SLIDES: readonly TourPage[] = [
  { title: "Plan it in one place", body: "Your dates, courses, tee times and who's coming live on the trip home.", navigation: { tab: "Home" },
    callout: { box: [4, 14, 92, 30], text: "Everything about the trip starts here." } },
  { title: "Invite your crew", body: "Send one link. Friends sign up and they're on the trip.", navigation: { tab: "Home" },
    callout: { box: [78, 1, 20, 8], text: "The invite link lives in Settings → Players." } },
  { title: "Compete all trip long", body: "Pick teams, pairs or everyone for themselves. The board keeps score across every round.", navigation: { tab: "Golf" },
    callout: { box: [4, 16, 92, 34], text: "The leaderboard updates as scores come in." } },
  { title: "Live scoring", body: "Everyone enters their own scores, hole by hole, right on their phone.", navigation: { tab: "Golf" },
    callout: { box: [4, 52, 92, 22], text: "Tap in your score after each hole." } },
  { title: "Side games", body: "Add skins, predictions and match picks to keep every hole interesting. Set them up any time in Settings.", navigation: { tab: "Golf" } },
  { title: "Relive it", body: "Every round stays in each player's history after the trip.", navigation: { tab: "Home" } },
];
