import { normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import type { PlayerRound } from "@/lib/platform/playerRounds";
import { assignAttesters, type RoundGroup } from "@/lib/platform/roundGroups";
import { DEV_TRIP_ID, devTripRoundId } from "./devPlayerRounds";

/**
 * DEV ONLY: the preview trip's group for Player & Attest. The first match's golfers are the group; the signed-in mock
 * account plays as its first golfer (the Scoring sheet's "you"), everyone else gets a stand-in id. `names` maps ids back
 * to leaderboard names.
 */
export interface DevGroup extends RoundGroup { names: Record<string, string> }
export const devGolferId = (name: string) => `dev-golfer:${name}`;

export function devTripGroup(match: GolfMatchPreview, viewAs: string, swaps: Record<string, string> = {}): DevGroup | null {
  const pairing = match.matches[0];
  if (!pairing) return null;
  const left = normalizeCompetitor(pairing.left).golfers, right = pairing.right ? normalizeCompetitor(pairing.right).golfers : [];
  const golfers = [...left.map((g) => ({ name: g.name, side: "left" as const })), ...right.map((g) => ({ name: g.name, side: "right" as const }))];
  if (!golfers.length) return null;
  const competitive = right.length > 0;
  const idOf = (name: string, index: number) => index === 0 ? viewAs : devGolferId(name);
  const id = `${DEV_TRIP_ID}:${devTripRoundId(match)}:group-1`;
  const players = assignAttesters(golfers.map((g, i) => ({ profileId: idOf(g.name, i), side: competitive ? g.side : undefined })))
    .map((p) => swaps[`${id}|${p.profileId}`] ? { ...p, attesterProfileId: swaps[`${id}|${p.profileId}`] } : p);
  return {
    id, source: "trip", tripId: DEV_TRIP_ID, tripRoundId: devTripRoundId(match), course: { ref: null, name: match.course, place: "" },
    datePlayed: match.roundDate, players, startedBy: viewAs, names: Object.fromEntries(golfers.map((g, i) => [idOf(g.name, i), g.name])),
  };
}

/** Whose score this player keeps (they are that player's attester). */
export const attesteeOf = (group: RoundGroup, profileId: string) => group.players.find((p) => p.attesterProfileId === profileId)?.profileId ?? null;

const label = (value: number) => value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
const parse = (text: string) => text === "E" ? 0 : Number.isFinite(Number(text)) ? Number(text) : 0;

/** Saved rounds win on the leaderboard: that golfer's row shows the saved holes, F, and the round to par. */
export function withSavedRounds(match: GolfMatchPreview, group: DevGroup, rounds: PlayerRound[]): GolfMatchPreview {
  const forRound = rounds.filter((round) => round.tripId === group.tripId && round.tripRoundId === group.tripRoundId);
  if (!forRound.length) return match;
  const leaderboard = match.leaderboard.map((row) => {
    const round = forRound.find((r) => group.names[r.profileId] === row.golfer.name);
    if (!round) return row;
    const today = round.holes.reduce((sum, h) => sum + h.strokes - h.par, 0);
    const total = parse(row.total) - parse(row.today) + today;
    return { ...row, holes: round.holes.map((h) => h.strokes), thru: "F", today: label(today), total: label(total),
      golfer: { ...row.golfer, thru: "F", score: label(total) } };
  });
  return { ...match, leaderboard };
}
