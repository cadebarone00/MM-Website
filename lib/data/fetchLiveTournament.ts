import { mergeLiveTournament } from "./live";
import { normalizePayload } from "./liveFeedNormalize";
import type { Tournament } from "./types";

/**
 * Server-side equivalent of the client's useLiveTournament() hook, for use
 * in Route Handlers that need to validate something against the live
 * tournament's real data (e.g. resolving a bet's real market odds) —
 * fetches LIVE_FEED_URL directly rather than round-tripping through our
 * own /api/live-feed endpoint.
 *
 * Always returns a valid Tournament, never null — mirrors
 * mergeLiveTournament()'s own contract and the client's useLiveTournament()
 * hook: no live feed configured/reachable degrades gracefully to the
 * upcoming2027-based fallback (empty matches/leaderboard), not a fatal
 * error. This matters because futures markets (Team Winner, Tournament
 * Winner) only need tournament.slug/individualLeaderboard, both valid on
 * that fallback, so they stay bettable with zero live feed data — exactly
 * the state this app is in most of the time before a tournament goes live.
 */
export async function fetchLiveTournament(): Promise<Tournament> {
  const url = process.env.LIVE_FEED_URL;
  if (!url) return mergeLiveTournament(null);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return mergeLiveTournament(null);
    const data = await res.json();
    return mergeLiveTournament(normalizePayload(data));
  } catch {
    return mergeLiveTournament(null);
  }
}
