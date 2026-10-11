import type { ProfileHistoryRound } from "./playerRoundsRows";
import { buildPlayerModel, simulateTrip, type CourseSetup, type LiveScores, type SimResult } from "./predictModel";
import { courseHandicap, strokesReceived } from "./roundGames";
import { evenLine as nearMiddleLine, statLines, type StatKey } from "./predictStats";

/**
 * Golf Trip → Predict: the bet catalogue (owner list 2026-10-11) and each bet's odds, all read off one Monte Carlo run
 * of the trip (lib/platform/predictModel.ts). Odds come only from the model (owner decision 2026-10-11): before the trip
 * from history, then re-run with the live scores locked in (`setup.live`), so they move with play, not with bets. Team matches are played hole by hole: singles = each player,
 * four-ball = best ball; scramble / alternate shot / shamble / Chapman are approximated as best ball.
 */

export type BetCategory = "Winners" | "Scoring" | "Props" | "Today";
export const BET_CATEGORIES: BetCategory[] = ["Winners", "Scoring", "Props", "Today"];
export type BetId = "teamWinner" | "teamSpread" | "individualWinner" | "topPointEarner" | "bottomPointEarner"
  | "lowTotal" | "lowRound" | "highTotal" | "highRound" | "birdies" | "doubles" | "holeInOne" | "matchMargin" | "todayMatches"
  | "roundBirdies" | "roundDoubles" | "roundStats" | "tripStats" | "roundScore" | "tripScore";

export interface BetDef { id: BetId; category: BetCategory; title: string; blurb: string; teamOnly: boolean }
export const BETS: BetDef[] = [
  { id: "teamWinner", category: "Winners", title: "Team winner", blurb: "Which team finishes with the most points.", teamOnly: true },
  { id: "teamSpread", category: "Winners", title: "Team winner spread", blurb: "Winning margin in points, with a slider for alternate spreads.", teamOnly: true },
  { id: "individualWinner", category: "Winners", title: "Individual winner", blurb: "Lowest total score for the trip after handicaps (net).", teamOnly: false },
  { id: "topPointEarner", category: "Winners", title: "Highest point earner", blurb: "Who wins the most match points.", teamOnly: true },
  { id: "bottomPointEarner", category: "Winners", title: "Lowest point earner", blurb: "Who wins the fewest match points.", teamOnly: true },
  { id: "lowTotal", category: "Scoring", title: "Lowest total to par", blurb: "Best gross score to par over the whole trip.", teamOnly: false },
  { id: "lowRound", category: "Scoring", title: "Lowest round of the trip", blurb: "Will anyone shoot under each line in a single round?", teamOnly: false },
  { id: "highTotal", category: "Scoring", title: "Highest total to par", blurb: "Will the worst trip total go over each line?", teamOnly: false },
  { id: "highRound", category: "Scoring", title: "Highest round to par", blurb: "Will anyone's worst round go over each line?", teamOnly: false },
  { id: "tripScore", category: "Scoring", title: "Player score (trip)", blurb: "Each player's total strokes for the whole trip: over or under their line.", teamOnly: false },
  { id: "birdies", category: "Props", title: "Birdies", blurb: "Most or fewest birdies (or better) on the trip.", teamOnly: false },
  { id: "doubles", category: "Props", title: "Doubles or worse", blurb: "Most or fewest double bogeys or worse on the trip.", teamOnly: false },
  { id: "holeInOne", category: "Props", title: "Hole in one", blurb: "Does anyone make an ace on the trip?", teamOnly: false },
  { id: "matchMargin", category: "Props", title: "Largest match margin", blurb: "The biggest win in any match: will it reach each margin?", teamOnly: true },
  { id: "tripStats", category: "Props", title: "Greens, fairways & putts (trip)", blurb: "Each player's greens hit, fairways hit or putts for the whole trip: over or under their line.", teamOnly: false },
  { id: "todayMatches", category: "Today", title: "Today's matches", blurb: "Odds for each of today's matches, updated hole by hole.", teamOnly: true },
  { id: "roundBirdies", category: "Today", title: "Birdies this round", blurb: "Each player's birdies (or better) this round: over or under their line.", teamOnly: false },
  { id: "roundDoubles", category: "Today", title: "Doubles or worse this round", blurb: "Each player's doubles or worse this round: over or under their line.", teamOnly: false },
  { id: "roundScore", category: "Today", title: "Player score this round", blurb: "Each player's strokes this round: over or under their line.", teamOnly: false },
  { id: "roundStats", category: "Today", title: "Greens, fairways & putts this round", blurb: "Each player's greens hit, fairways hit or putts this round: over or under their line.", teamOnly: false },
];
export const betDef = (id: BetId) => BETS.find((b) => b.id === id)!;
/** Bets an organizer can turn on for this trip (team bets need a team competition). */
export const betAllowed = (id: BetId, teamEvent: boolean) => teamEvent || !betDef(id).teamOnly;

export interface TripPlayer { id: string; name: string; team: 0 | 1 | null; rounds: ProfileHistoryRound[]; handicapIndex: number | null }
/** `net`: handicap strokes come off on the hardest holes before holes are compared (net match play). */
export interface TripMatch { left: string[]; right: string[]; points: number; nassau: boolean; net?: boolean }
export interface TripRound { course: CourseSetup; /** Empty = stroke play (no matches this round). */ matches: TripMatch[] }
/** Real scores so far, by player id: `holes[id][round][hole]` (null = not played) and finished rounds' totals. */
export interface TripLive { holes?: Record<string, (number | null)[][]>; roundTotals?: Record<string, (number | null)[]> }
/** `currentRound`: today's round (0-based) for the Today tab; unset = the first round. */
export interface TripSetup { players: TripPlayer[]; rounds: TripRound[]; teamNames: [string, string]; teamEvent: boolean; live?: TripLive; currentRound?: number }

export interface Outcome { id: string; label: string; chance: number }
export interface LadderLine { label: string; line: number; chance: number }
export type Market =
  | { bet: BetId; kind: "outcomes"; outcomes: Outcome[] }
  | { bet: BetId; kind: "twoSided"; most: Outcome[]; least: Outcome[] }
  | { bet: BetId; kind: "ladder"; lines: LadderLine[] }
  | { bet: BetId; kind: "spread"; teams: [string, string]; lines: { spread: number; chanceA: number }[]; defaultSpread: number }
  | { bet: BetId; kind: "yesNo"; chance: number }
  | { bet: BetId; kind: "matches"; round: number; matches: TodayMatch[] }
  /** `round`: null = the whole trip. */
  | { bet: BetId; kind: "playerLines"; round: number | null; rows: PlayerLine[] }
  /** `round`: null = the whole trip. */
  | { bet: BetId; kind: "statLines"; round: number | null; stats: Record<StatKey, PlayerLine[]> };

/** One player's over / under for this round: the half-number line closest to 50 / 50, and the chance of going over. */
export interface PlayerLine { id: string; name: string; line: number; over: number; count: number }

/** One of today's matches: each side's players, where it stands from the real holes, and [left wins, halved, right wins]. */
export interface TodayMatch { left: string; right: string; status: string; chances: [number, number, number] }

/** One in 12,500 per par-3 tee shot: the usual figure for an average amateur. */
export const ACE_CHANCE_PER_PAR3 = 1 / 12500;

/** Any ace on the trip: already made = 1; otherwise 1 in 12,500 for every par-3 tee shot still to be played. */
export function holeInOneChance(setup: TripSetup): number {
  let shotsLeft = 0;
  for (const player of setup.players) setup.rounds.forEach((round, r) => {
    const played = setup.live?.holes?.[player.id]?.[r];
    const finished = setup.live?.roundTotals?.[player.id]?.[r] != null;
    round.course.par.forEach((par, h) => {
      const strokes = played?.[h];
      if (par !== 3) return;
      if (strokes === 1) shotsLeft = -Infinity;
      else if (strokes == null && !finished) shotsLeft++;
    });
  });
  return shotsLeft === -Infinity ? 1 : 1 - (1 - ACE_CHANCE_PER_PAR3) ** shotsLeft;
}

/** Splits wins evenly between everyone tied for the best value (`better(a, b)` true when a beats b). */
function shareWins(values: number[], pickLow: boolean, wins: number[]) {
  const best = pickLow ? Math.min(...values) : Math.max(...values);
  const tied = values.flatMap((v, i) => v === best ? [i] : []);
  for (const i of tied) wins[i] += 1 / tied.length;
}

/** Up to `count` evenly spaced whole-number lines where the yes chance is between 5% and 95%. */
function ladderLines(samples: number[], under: boolean, count = 6): number[] {
  const sorted = [...samples].sort((a, b) => a - b);
  const chance = (line: number) => (under ? sorted.filter((v) => v < line) : sorted.filter((v) => v > line)).length / sorted.length;
  const candidates: number[] = [];
  for (let line = sorted[0] - 1; line <= sorted[sorted.length - 1] + 1; line++) {
    const c = chance(line);
    if (c >= 0.05 && c <= 0.95) candidates.push(line);
  }
  if (candidates.length <= count) return candidates;
  const step = (candidates.length - 1) / (count - 1);
  return [...new Set(Array.from({ length: count }, (_, i) => candidates[Math.round(i * step)]))];
}

const toPar = (n: number) => n === 0 ? "E" : n > 0 ? `+${n}` : String(n);

/** The half-number line (at least `floor` + 0.5, the count already made) where over / under is closest to 50 / 50. */
function evenLine(samples: number[], floor: number): number {
  let best = floor + 0.5, gap = Infinity;
  for (let line = floor + 0.5; line <= Math.max(...samples) + 0.5; line += 1) {
    const over = samples.filter((v) => v > line).length / samples.length;
    if (Math.abs(over - 0.5) < gap) { gap = Math.abs(over - 0.5); best = line; }
  }
  return best;
}

/** Where a match stands from the holes both sides have played: "Not started", "Thru 9 · Ace 2 UP", "Ace won 3&2". */
function matchStatus(match: TripMatch, setup: TripSetup, round: number, holeCount: number, received: number[][] | null): string {
  const index = (id: string) => setup.players.findIndex((p) => p.id === id);
  const side = (ids: string[]) => ids.map((id) => ({ card: setup.live?.holes?.[id]?.[round] ?? [], strokes: received?.[index(id)] ?? [] }));
  const left = side(match.left), right = side(match.right);
  const best = (cards: { card: (number | null)[]; strokes: number[] }[], h: number) => {
    const scores = cards.flatMap(({ card, strokes }) => card[h] == null ? [] : [(card[h] as number) - (strokes[h] ?? 0)]);
    return scores.length ? Math.min(...scores) : null;
  };
  let lead = 0, thru = 0;
  for (let h = 0; h < holeCount; h++) {
    const l = best(left, h), r = best(right, h);
    if (l === null || r === null) break;
    lead += l < r ? 1 : l > r ? -1 : 0;
    thru = h + 1;
    if (Math.abs(lead) > holeCount - thru) break;
  }
  const name = (ids: string[]) => ids.map((id) => setup.players.find((p) => p.id === id)?.name.split(/\s+/)[0] ?? id).join(" & ");
  const leader = lead > 0 ? name(match.left) : name(match.right);
  if (thru === 0) return "Not started";
  const left_ = holeCount - thru;
  if (Math.abs(lead) > left_) return `${leader} won ${Math.abs(lead)}&${left_}`;
  if (thru === holeCount) return lead === 0 ? "Halved" : `${leader} won ${Math.abs(lead)} UP`;
  return `Thru ${thru} · ${lead === 0 ? "All square" : `${leader} ${Math.abs(lead)} UP`}`;
}

/** Prices every bet for this trip. Team bets are left out for individual-only trips. */
export function priceTrip(setup: TripSetup, sims = 10000, seed = 1): Market[] {
  const { players, rounds } = setup;
  const models = players.map((p) => buildPlayerModel(p.id, p.name, p.rounds, p.handicapIndex));
  const index = new Map(players.map((p, i) => [p.id, i]));
  const coursePars = rounds.map((r) => r.course.par.reduce((a, b) => a + b, 0));
  const teamPoints: number[][] = [], playerPoints: number[][] = [], maxLead: number[] = [];
  const today = Math.min(Math.max(setup.currentRound ?? 0, 0), rounds.length - 1);
  // Net matches: each player's handicap strokes per hole, per round (hardest holes first, by stroke index).
  const received = rounds.map((round) => {
    const course = { par: round.course.par, strokeIndex: round.course.strokeIndex, rating: round.course.rating, slope: round.course.slope };
    const range: [number, number] = [0, round.course.par.length];
    return models.map((m) => strokesReceived(courseHandicap(m.handicapIndex ?? 18, course, range), course, range));
  });
  const todayResults = rounds[today]?.matches.map(() => [0, 0, 0]) ?? [];
  let simTeam = [0, 0], simPlayer = players.map(() => 0), simLead = 0;

  const live: LiveScores = {
    holes: players.map((p) => setup.live?.holes?.[p.id] ?? []),
    roundTotals: players.map((p) => setup.live?.roundTotals?.[p.id] ?? []),
  };
  const sim: SimResult = simulateTrip(models, rounds.map((r) => r.course), sims, seed, (s, r, holes) => {
    if (r === 0) { simTeam = [0, 0]; simPlayer = players.map(() => 0); simLead = 0; }
    for (const match of rounds[r].matches) {
      const side = (ids: string[]) => ids.map((id) => index.get(id)!).filter((i) => i !== undefined);
      const left = side(match.left), right = side(match.right);
      if (!left.length || !right.length) continue;
      const leftTeam = players[left[0]].team ?? 0;
      const segments = match.nassau ? [[0, 9], [9, 18], [0, 18]] : [[0, 18]];
      for (const [from, to] of segments) {
        let lead = 0, closed: number | null = null;
        for (let h = from; h < to; h++) {
          const score = (p: number) => holes[p][h] - (match.net ? received[r][p][h] : 0);
          const l = Math.min(...left.map(score)), rr = Math.min(...right.map(score));
          lead += l < rr ? 1 : l > rr ? -1 : 0;
          if (closed === null && Math.abs(lead) > to - h - 1) closed = Math.abs(lead);
        }
        if (from === 0 && to === 18) {
          simLead = Math.max(simLead, closed ?? Math.abs(lead));
          if (r === today) { const index = rounds[r].matches.indexOf(match); todayResults[index][lead > 0 ? 0 : lead < 0 ? 2 : 1]++; }
        }
        const result = lead > 0 ? 1 : lead < 0 ? 0 : 0.5;
        simTeam[leftTeam] += match.points * result;
        simTeam[1 - leftTeam] += match.points * (1 - result);
        for (const p of left) simPlayer[p] += match.points * result;
        for (const p of right) simPlayer[p] += match.points * (1 - result);
      }
    }
    if (r === rounds.length - 1) { teamPoints[s] = simTeam; playerPoints[s] = simPlayer; maxLead[s] = simLead; }
  }, live);

  const n = sim.sims;
  const totals = sim.results.map((s) => s.map((rs) => rs.reduce((a, r) => a + r.total, 0)));
  const toParTotals = totals.map((t) => t.map((x) => x - coursePars.reduce((a, b) => a + b, 0)));
  const outcomes = (wins: number[]): Outcome[] => players.map((p, i) => ({ id: p.id, label: p.name, chance: wins[i] / n })).sort((a, b) => b.chance - a.chance);
  const markets: Market[] = [];
  const hasMatches = rounds.some((r) => r.matches.length > 0);

  if (setup.teamEvent && hasMatches) {
    let a = 0, b = 0, tie = 0;
    const margins = teamPoints.map((t) => t[0] - t[1]);
    for (const m of margins) { if (m > 0) a++; else if (m < 0) b++; else tie++; }
    markets.push({ bet: "teamWinner", kind: "outcomes", outcomes: [
      { id: "team0", label: setup.teamNames[0], chance: a / n }, { id: "team1", label: setup.teamNames[1], chance: b / n },
      ...(tie ? [{ id: "tie", label: "Tie", chance: tie / n }] : [])] });
    // Spreads in half points (no pushes): Team A -1.5 = A wins by 2 or more.
    const maxPts = Math.max(1, ...margins.map(Math.abs));
    const lines = [];
    for (let s = -Math.ceil(maxPts) - 0.5; s <= Math.ceil(maxPts) + 0.5; s += 1) lines.push({ spread: s, chanceA: margins.filter((m) => m + s > 0).length / n });
    const useful = lines.filter((l) => l.chanceA > 0.02 && l.chanceA < 0.98);
    const shown = useful.length ? useful : lines;
    const defaultSpread = shown.reduce((best, l) => Math.abs(l.chanceA - 0.5) < Math.abs(best.chanceA - 0.5) ? l : best).spread;
    markets.push({ bet: "teamSpread", kind: "spread", teams: setup.teamNames, lines: shown, defaultSpread });
    const top = players.map(() => 0), bottom = players.map(() => 0);
    for (const pts of playerPoints) { shareWins(pts, false, top); shareWins(pts, true, bottom); }
    markets.push({ bet: "topPointEarner", kind: "outcomes", outcomes: outcomes(top) });
    markets.push({ bet: "bottomPointEarner", kind: "outcomes", outcomes: outcomes(bottom) });
    const big = ladderLines(maxLead, false, 4).filter((l) => l >= 1);
    markets.push({ bet: "matchMargin", kind: "ladder", lines: big.map((l) => ({ label: `${l + 1}&${l} or bigger`, line: l, chance: maxLead.filter((m) => m > l).length / n })) });
  }

  // Individual winner (net): course handicap strokes off each round.
  const strokes = players.map((p, i) => rounds.reduce((a, r) => {
    const hcp = models[i].handicapIndex ?? 18;
    const { rating, slope, par } = r.course;
    const coursePar = par.reduce((x, y) => x + y, 0);
    return a + Math.round(rating !== null && slope !== null ? hcp * slope / 113 + (rating - coursePar) : hcp) * (par.length / 18);
  }, 0));
  const netWins = players.map(() => 0), grossWins = players.map(() => 0);
  for (const t of totals) { shareWins(t.map((x, i) => x - strokes[i]), true, netWins); shareWins(t, true, grossWins); }
  markets.push({ bet: "individualWinner", kind: "outcomes", outcomes: outcomes(netWins) });
  markets.push({ bet: "lowTotal", kind: "outcomes", outcomes: outcomes(grossWins) });

  // Ladders.
  const lowRounds = sim.results.map((s) => Math.min(...s.flatMap((rs) => rs.map((r) => r.total))));
  markets.push({ bet: "lowRound", kind: "ladder", lines: ladderLines(lowRounds, true).map((l) => ({ label: `Under ${l}`, line: l, chance: lowRounds.filter((v) => v < l).length / n })) });
  const highTotals = toParTotals.map((t) => Math.max(...t));
  markets.push({ bet: "highTotal", kind: "ladder", lines: ladderLines(highTotals, false).map((l) => ({ label: `Over ${toPar(l)}`, line: l, chance: highTotals.filter((v) => v > l).length / n })) });
  const highRounds = sim.results.map((s) => Math.max(...s.flatMap((rs) => rs.map((r, ri) => r.total - coursePars[ri]))));
  markets.push({ bet: "highRound", kind: "ladder", lines: ladderLines(highRounds, false).map((l) => ({ label: `Over ${toPar(l)}`, line: l, chance: highRounds.filter((v) => v > l).length / n })) });

  // Most / least (switch on the card).
  for (const [bet, key] of [["birdies", "birdies"], ["doubles", "doubles"]] as const) {
    const most = players.map(() => 0), least = players.map(() => 0);
    for (const s of sim.results) { const counts = s.map((rs) => rs.reduce((a, r) => a + r[key], 0)); shareWins(counts, false, most); shareWins(counts, true, least); }
    markets.push({ bet, kind: "twoSided", most: outcomes(most), least: outcomes(least) });
  }

  markets.push({ bet: "holeInOne", kind: "yesNo", chance: holeInOneChance(setup) });

  // Player over / unders for today's round (one round, even on a 36-hole day): birdies and doubles or worse.
  for (const [bet, key] of [["roundBirdies", "birdies"], ["roundDoubles", "doubles"]] as const) {
    markets.push({ bet, kind: "playerLines", round: today, rows: players.map((p, i) => {
      const samples = sim.results.map((s) => s[i][today][key]);
      const played = (setup.live?.holes?.[p.id]?.[today] ?? []).reduce<number>((a, strokes, h) => {
        const par = rounds[today].course.par[h];
        return strokes == null ? a : a + (key === "birdies" ? Number(strokes < par) : Number(strokes >= par + 2));
      }, 0);
      const line = evenLine(samples, played);
      return { id: p.id, name: p.name, line, over: samples.filter((v) => v > line).length / n, count: played };
    }) });
  }

  // Player score over / unders (gross strokes): this round (Today) and the whole trip (Scoring). "So far" = strokes already made.
  const strokesSoFar = (id: string, r: number) => setup.live?.roundTotals?.[id]?.[r] ?? (setup.live?.holes?.[id]?.[r] ?? []).reduce<number>((a, x) => a + (x ?? 0), 0);
  for (const scope of [today, null]) {
    markets.push({ bet: scope === null ? "tripScore" : "roundScore", kind: "playerLines", round: scope, rows: players.map((p, i) => {
      const samples = scope === null ? totals.map((t) => t[i]) : sim.results.map((s) => s[i][scope].total);
      const made = scope === null ? rounds.reduce((a, _, r) => a + strokesSoFar(p.id, r), 0) : strokesSoFar(p.id, scope);
      const line = nearMiddleLine(samples, made);
      return { id: p.id, name: p.name, line, over: samples.filter((v) => v > line).length / n, count: made };
    }) });
  }

  // Greens, fairways and putts: this round (Today) and the whole trip (Props).
  markets.push({ bet: "roundStats", kind: "statLines", round: today, stats: statLines(setup, today) });
  markets.push({ bet: "tripStats", kind: "statLines", round: null, stats: statLines(setup, "trip") });

  // Today's matches: odds per match from the same run (real holes locked in), with the live standing.
  if (setup.teamEvent && rounds[today]?.matches.length) {
    const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
    markets.push({ bet: "todayMatches", kind: "matches", round: today, matches: rounds[today].matches.map((match, i) => ({
      left: match.left.map(name).join(" & "), right: match.right.map(name).join(" & "),
      status: matchStatus(match, setup, today, rounds[today].course.par.length, match.net ? received[today] : null),
      chances: todayResults[i].map((c) => c / n) as [number, number, number],
    })) });
  }
  return markets.filter((m) => betAllowed(m.bet, setup.teamEvent));
}
