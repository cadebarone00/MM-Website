import { normalizeCompetitor, type GolfMatchPreview } from "./golfTripPreviewFixture";
import type { CompetitionStructure } from "./golfTripNavigation";
import type { ProfileHistoryRound } from "./playerRoundsRows";
import type { TripLive, TripMatch, TripPlayer, TripSetup } from "./predictBets";

/**
 * Golf Trip → Predict: the trip as the bet models need it, from the trip page's match data. Players come from the
 * matches and leaderboard (name + handicap); left side = team 1, right = team 2; each of the trip's rounds is played on
 * this round's pars. `history` adds a player's real past rounds (by name) when the page has them; without it the
 * model uses a typical profile for their handicap. Live scores: the leaderboard's hole-by-hole card for the current
 * round, and earlier rounds' totals (total to par minus today, split evenly across the earlier rounds).
 */
export function tripSetupFromPreview(match: GolfMatchPreview, structure: CompetitionStructure, history: Record<string, ProfileHistoryRound[]> = {}): TripSetup {
  const players = new Map<string, TripPlayer>();
  const add = (name: string, hcp: number, team: 0 | 1 | null) => {
    const existing = players.get(name);
    if (existing) { if (existing.team === null) existing.team = team; return; }
    // The trip data fills in 0 when a golfer's handicap isn't known: treat that as unknown (history or a typical profile decides).
    players.set(name, { id: name, name, team, rounds: history[name] ?? [], handicapIndex: Number.isFinite(hcp) && hcp !== 0 ? hcp : null });
  };
  const byRound = new Map<number, TripMatch[]>();
  for (const pairing of match.matches) {
    const left = normalizeCompetitor(pairing.left);
    const right = pairing.right ? normalizeCompetitor(pairing.right) : null;
    left.golfers.forEach((g) => add(g.name, g.hcp, 0));
    right?.golfers.forEach((g) => add(g.name, g.hcp, 1));
    if (!right || !structure.team) continue;
    const round = pairing.round ?? match.round;
    // Net when the round plays with handicaps (Net, or Both — the match box defaults to net then).
    const net = match.scoring ? match.scoring !== "Gross" : match.handicap;
    byRound.set(round, [...(byRound.get(round) ?? []), { left: left.golfers.map((g) => g.name), right: right.golfers.map((g) => g.name), points: 1, nassau: false, net }]);
  }
  for (const entry of match.leaderboard) add(entry.golfer.name, entry.golfer.hcp, null);
  // A round without its own matchups reuses the current round's (the preview only knows one round's pairings).
  const current = byRound.get(match.round) ?? [];
  const rounds = Array.from({ length: Math.max(1, match.roundCount) }, (_, i) => ({
    course: { par: match.par.length === 18 ? match.par : [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5], rating: null, slope: null },
    matches: structure.team ? byRound.get(i + 1) ?? current : [],
  }));
  return { players: [...players.values()], rounds, teamNames: [match.sides[0]?.name ?? "Team 1", match.sides[1]?.name ?? "Team 2"], teamEvent: structure.team, live: liveScores(match, rounds.length), currentRound: Math.min(Math.max(match.round, 1), rounds.length) - 1 };
}

/** "+5" / "E" / "-3" → 5 / 0 / -3; anything else (e.g. "—") → null. */
const toParNumber = (text: string | undefined) => !text ? null : text.trim() === "E" ? 0 : /^[+-]?\d+$/.test(text.trim()) ? Number(text.trim()) : null;

function liveScores(match: GolfMatchPreview, roundCount: number): TripLive {
  const holes: TripLive["holes"] = {}, roundTotals: TripLive["roundTotals"] = {};
  const current = Math.min(Math.max(match.round, 1), roundCount) - 1;
  const coursePar = match.par.reduce((a, b) => a + b, 0);
  for (const entry of match.leaderboard) {
    const name = entry.golfer.name;
    if (entry.holes.some((h) => h !== null)) holes[name] = Array.from({ length: current + 1 }, (_, r) => r === current ? entry.holes.slice(0, 18) : []);
    const total = toParNumber(entry.total), today = toParNumber(entry.today) ?? 0;
    if (current > 0 && total !== null) {
      const earlier = total - today, base = Math.floor(earlier / current), extra = earlier - base * current;
      roundTotals[name] = Array.from({ length: current }, (_, r) => coursePar + base + (r < extra ? 1 : 0));
    }
  }
  return { holes, roundTotals };
}
