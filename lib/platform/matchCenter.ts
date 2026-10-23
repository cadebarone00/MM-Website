import { normalizeCompetitor, type GolfMatchPairing, type GolfMatchPreview, type GolfMatchStanding } from "./golfTripPreviewFixture";
import { buildPlayerModel, simulateTrip, type CourseSetup } from "./predictModel";
import { courseHandicap, strokesReceived } from "./roundGames";

/**
 * Golf → Matches → a match: hole-by-hole match play worked out from the players' own hole scores (so the scorecard,
 * the status and the graph always agree), and the chance of winning after each hole by the same method as Predict
 * (lib/platform/predictModel.ts): each player's model from their history / handicap, the holes played locked in, the
 * rest simulated. Pairs / teams play best ball (scramble-type formats approximated as best ball, as in Predict).
 */

export interface MatchPlayer { name: string; hcp: number | null; holes: (number | null)[]; strokes: number[] }
export interface MatchHole { hole: number; par: number; left: number | null; right: number | null; winner: "left" | "right" | "halved" | null; /** Left side's lead after this hole (+ = left up). */ lead: number | null }
export interface MatchCard { left: MatchPlayer[]; right: MatchPlayer[]; holes: MatchHole[]; played: number; standing: GolfMatchStanding; finished: boolean; result?: string }

const course = (match: GolfMatchPreview): CourseSetup => ({ par: match.par, rating: null, slope: null });
/** Handicaps of 0 in preview data are placeholders, as in Predict. */
const knownHcp = (hcp: number | undefined) => hcp ? hcp : null;

/** The match's players with their hole scores (this round's leaderboard) and handicap strokes per hole when net. */
function players(match: GolfMatchPreview, pairing: GolfMatchPairing, side: "left" | "right", net: boolean): MatchPlayer[] {
  const comp = side === "left" ? normalizeCompetitor(pairing.left) : pairing.right ? normalizeCompetitor(pairing.right) : null;
  return (comp?.golfers ?? []).map((golfer) => {
    const row = match.leaderboard.find((entry) => entry.golfer.name === golfer.name);
    const hcp = knownHcp(golfer.hcp ?? row?.golfer.hcp);
    const range: [number, number] = [0, match.par.length];
    return { name: golfer.name, hcp, holes: row?.holes ?? Array(match.par.length).fill(null),
      // Unknown handicap: strokes for 18, the same index the model assumes, so net stays fair.
      strokes: net ? strokesReceived(courseHandicap(hcp ?? 18, course(match), range), course(match), range) : Array(match.par.length).fill(0) };
  });
}

/** A side's score on a hole: the best (net) score among its players who played it. */
function sideScore(side: MatchPlayer[], h: number): number | null {
  const scores = side.flatMap((p) => p.holes[h] == null ? [] : [(p.holes[h] as number) - p.strokes[h]]);
  return scores.length ? Math.min(...scores) : null;
}

/** The match hole by hole, stopping where either side hasn't played or once it's decided. */
export function matchCard(match: GolfMatchPreview, pairing: GolfMatchPairing, net: boolean): MatchCard {
  const left = players(match, pairing, "left", net), right = players(match, pairing, "right", net);
  let lead = 0, played = 0, open = true;
  const holes = match.par.map((par, h): MatchHole => {
    const l = sideScore(left, h), r = sideScore(right, h);
    if (!open || l === null || r === null) { open = false; return { hole: h + 1, par, left: l, right: r, winner: null, lead: null }; }
    lead += l < r ? 1 : l > r ? -1 : 0;
    played = h + 1;
    if (Math.abs(lead) > match.par.length - played) open = false;
    return { hole: h + 1, par, left: l, right: r, winner: l < r ? "left" : l > r ? "right" : "halved", lead };
  });
  const toPlay = match.par.length - played;
  const finished = played > 0 && (toPlay === 0 || Math.abs(lead) > toPlay);
  const standing: GolfMatchStanding = played === 0 ? null : { leader: lead > 0 ? "left" : lead < 0 ? "right" : null, up: Math.abs(lead) };
  const result = !finished ? undefined : lead === 0 ? "AS" : toPlay > 0 ? `${Math.abs(lead)}&${toPlay}` : `${Math.abs(lead)} UP`;
  return { left, right, holes, played, standing, finished, result };
}

/** Whether this round's leaderboard has hole scores for the match's players (so the match can be worked out from them). */
export function hasHoleScores(match: GolfMatchPreview, pairing: GolfMatchPairing): boolean {
  if ((pairing.round ?? match.round) !== match.round) return false;
  const card = matchCard(match, pairing, false);
  return card.left.length > 0 && card.right.length > 0 && [...card.left, ...card.right].every((p) => match.leaderboard.some((e) => e.golfer.name === p.name));
}

/**
 * The round's matches with standing / THRU / result worked out from the hole scores, where the leaderboard has them
 * (this round). Other rounds keep what the data says.
 */
export function withHoleStandings(match: GolfMatchPreview): GolfMatchPreview {
  return { ...match, matches: match.matches.map((pairing) => {
    if (match.roundStandings && pairing.result) return pairing;
    if (!hasHoleScores(match, pairing)) return pairing;
    const gross = matchCard(match, pairing, false), net = matchCard(match, pairing, true);
    const shown = (match.scoring ?? (match.handicap ? "Both" : "Gross")) === "Net" ? net : gross;
    // An empty scorecard cannot replace supplied match progress or a final result.
    if (shown.played === 0) return pairing;
    const thru = shown.played === 0 ? undefined : shown.played === match.par.length || shown.finished ? "F" : `Thru ${shown.played}`;
    const stamp = (side: GolfMatchPairing["left"] | undefined) => {
      if (!side || thru === undefined) return side;
      const comp = normalizeCompetitor(side);
      return { ...comp, thru, golfers: comp.golfers.map((g) => ({ ...g, thru })) };
    };
    return { ...pairing, gross: gross.standing, net: net.standing, result: shown.result, left: stamp(pairing.left)!, right: stamp(pairing.right) };
  }) };
}

/** One point on the win-chance graph: after `hole` holes (0 = before the first tee shot). */
export interface WinPoint { hole: number; left: number; halved: number; right: number }

/** Chance of each result after every hole played so far (Predict's model, the holes so far locked in). */
export function winCurve(match: GolfMatchPreview, card: MatchCard, sims = 1500, seed = 11, from = 0): WinPoint[] {
  const everyone = [...card.left, ...card.right];
  if (!card.left.length || !card.right.length) return [];
  const models = everyone.map((p) => buildPlayerModel(p.name, p.name, [], p.hcp));
  const n = match.par.length, leftCount = card.left.length;
  const points: WinPoint[] = [];
  for (let k = Math.min(from, card.played); k <= card.played; k++) {
    const tally = [0, 0, 0];
    const live = { holes: everyone.map((p) => [p.holes.map((s, h) => h < k ? s : null)]) };
    simulateTrip(models, [course(match)], sims, seed + k, (_s, _r, holes) => {
      let lead = 0;
      for (let h = 0; h < n; h++) {
        const best = (from: number, to: number) => Math.min(...everyone.slice(from, to).map((p, i) => holes[from + i][h] - p.strokes[h]));
        const l = best(0, leftCount), r = best(leftCount, everyone.length);
        lead += l < r ? 1 : l > r ? -1 : 0;
        if (Math.abs(lead) > n - h - 1) break;
      }
      tally[lead > 0 ? 0 : lead < 0 ? 2 : 1]++;
    }, live);
    points.push({ hole: k, left: tally[0] / sims, halved: tally[1] / sims, right: tally[2] / sims });
  }
  // Decided: the result is certain.
  if (card.finished) {
    const lead = card.holes[card.played - 1].lead ?? 0;
    points[points.length - 1] = { hole: card.played, left: Number(lead > 0), halved: Number(lead === 0), right: Number(lead < 0) };
  }
  return points;
}

/** The chance of each result right now (the curve's last point only). Null when a side has no players. */
export function winNow(match: GolfMatchPreview, card: MatchCard, sims = 600): WinPoint | null {
  return winCurve(match, card, sims, 11, card.played).at(-1) ?? null;
}
