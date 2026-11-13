/**
 * Trip Home → the Big Board (one gold-outlined box): the top half shows the scores once a round is on or done
 * (otherwise the Momentum content), the bottom half the upcoming plans one at a time. Pure logic, safe to import anywhere.
 */
import type { GolfMatchPreview } from "./golfTripPreviewFixture";
import { homeBoxes, sortItinerary, type HomeStatus, type ItineraryItem } from "./golfTripItinerary";
import { rankLeaderboard } from "./golfLeaderboardOrder";
import { resolveGolfFormat } from "./formats";
import { teamPoints } from "./teamPoints";

type TeamScore = { left: { name: string; points: number }; right: { name: string; points: number }; toWin: number; line: string };
/** One row of the individual Top 4 including the viewer. */
export type TopPlayer = { position: string; name: string; total: string };
export type BigBoardScore =
  | ({ kind: "team" } & TeamScore)
  | { kind: "individual"; leader: string; total: string; thru: string; line: string }
  /** Team & Individual trips: the team score condensed on the left, the individual Top 4 including the viewer on the right. */
  | ({ kind: "both"; top: TopPlayer[] } & TeamScore);

/** "2½" for halves, "3" otherwise (the Golf tab's way of showing points). */
export const halves = (n: number) => n % 1 ? `${Math.floor(n) || ""}½` : String(n);

/**
 * The scores for the top half, or null when there's nothing to show yet (no competition data, or no hole played).
 * Team points when the trip has matches; otherwise the individual leader.
 */
export function bigBoardScore(match: GolfMatchPreview | undefined, started: boolean, both = false, viewerName?: string | null): BigBoardScore | null {
  if (!match || !started) return null;
  const line = `Round ${match.round}${match.format ? ` · ${match.format}` : ""}`;
  const team = match.matches.length ? teamPoints(match) : null;
  const ranked = rankLeaderboard(match.leaderboard, { stableford: resolveGolfFormat(match.formatDef?.key ?? match.format).scoringMethod === "stableford" });
  const played = ranked.filter(row => row.holes.some(strokes => strokes !== null));
  if (team) {
    const teamScore = { left: { name: match.sides[0].name, points: team.points[0] }, right: { name: match.sides[1].name, points: team.points[1] }, toWin: team.available / 2 + 0.5, line };
    if (both && played.length) {
      const top = played.slice(0, 4);
      const viewer = viewerName?.trim() ? ranked.find(row => row.golfer.name.trim().toLowerCase() === viewerName.trim().toLowerCase()) : undefined;
      if (viewer && !top.some(row => row.golfer.name === viewer.golfer.name)) {
        if (top.length === 4) top.pop();
        top.push(viewer);
      }
      return { kind: "both", ...teamScore, top: top.map(row => ({ position: row.position, name: row.golfer.name, total: row.total })) };
    }
    return { kind: "team", ...teamScore };
  }
  const leader = match.leaderboard[0];
  if (leader && leader.holes.some(strokes => strokes !== null)) return { kind: "individual", leader: leader.golfer.name, total: leader.total, thru: leader.thru, line };
  return null;
}

/**
 * Every upcoming plan for the bottom half, in order: what's on now (LIVE golf round / NOW) first, then NEXT, then the
 * rest as UPCOMING. Same rules as the old two Home boxes, just not cut off at two.
 */
export function upcomingSlides(items: ItineraryItem[], now: string, liveRound?: ItineraryItem): { status: HomeStatus; item: ItineraryItem }[] {
  const first = homeBoxes(items, now, liveRound)[0];
  const current = first && (first.status === "LIVE" || first.status === "NOW") ? first : null;
  const later = sortItinerary(items).filter(item => item.startsAt > now.slice(0, 16) && item !== current?.item);
  return [...(current ? [current] : []), ...later.map((item, index) => ({ status: index === 0 ? "NEXT" as const : "UPCOMING" as const, item }))];
}
