import { mergeLiveTournament } from "./live";
import { normalizePayload } from "./liveFeedNormalize";
import type { Tournament } from "./types";

/**
 * Server-side equivalent of the client's useLiveTournament() hook, for use
 * in Route Handlers that need to validate something against the live
 * tournament's real data (e.g. resolving a bet's real market odds) —
 * fetches LIVE_FEED_URL directly rather than round-tripping through our
 * own /api/live-feed endpoint. Returns null if the feed isn't configured
 * or unreachable; callers should treat that as "no live tournament data
 * available right now," not throw.
 */
export async function fetchLiveTournament(): Promise<Tournament | null> {
  const url = process.env.LIVE_FEED_URL;
  if (!url) return null;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return mergeLiveTournament(normalizePayload(data));
  } catch {
    return null;
  }
}
