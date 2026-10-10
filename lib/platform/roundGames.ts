/**
 * Play a round → games. Plain scoring rules for every game a group can play, so they're easy to test.
 * Players are indexes into the group (0 = the scorekeeper). Holes are 0-based; only holes in `range` are played.
 * A hole counts once every player has a score on it (`null` = not played yet).
 *
 * Points games use one model: when a side wins a hole, each winner takes 1 point from each loser (so points add up to
 * zero across the group). "Birdies double points" doubles a hole's points when the winning score is birdie or better.
 */

export type GameId =
  | "stroke" | "stableford" | "match" | "nassau" | "bestball" | "skins" | "wolf" | "vegas" | "daytona"
  | "bbb" | "nines" | "sixes" | "snake" | "scramble" | "shamble" | "alternate" | "chapman";

export interface GameDef {
  id: GameId;
  name: string;
  /** One line for the setup screen. */
  blurb: string;
  /** Group sizes the game works for. */
  players: number[];
  /** Two teams picked in setup (2v2 games and team formats). */
  teams: boolean;
  /** Team formats aren't own ball, so the round can't count toward a handicap. */
  teamFormat: boolean;
  /** Points game: offers "Birdies double points". */
  points: boolean;
  /** An extra tap per hole while playing. */
  holeInput?: "wolf" | "daytona" | "bbb" | "snake";
}

export const GAMES: GameDef[] = [
  { id: "stroke", name: "Stroke Play", blurb: "Lowest total wins.", players: [2, 3, 4, 5], teams: false, teamFormat: false, points: false },
  { id: "stableford", name: "Stableford", blurb: "Points for each hole: par 2, birdie 3, eagle 4. Most points wins.", players: [2, 3, 4, 5], teams: false, teamFormat: false, points: true },
  { id: "match", name: "Match Play", blurb: "Win holes, not strokes. 1 v 1, or 2 v 2 best ball.", players: [2, 4], teams: true, teamFormat: false, points: false },
  { id: "nassau", name: "Nassau", blurb: "Three matches: front 9, back 9 and overall.", players: [2, 4], teams: true, teamFormat: false, points: false },
  { id: "bestball", name: "Best Ball", blurb: "2 v 2. Each team's best score on each hole counts.", players: [4], teams: true, teamFormat: false, points: false },
  { id: "skins", name: "Skins", blurb: "Outright low score wins the hole's skin. Ties carry over.", players: [2, 3, 4, 5], teams: false, teamFormat: false, points: true },
  { id: "wolf", name: "Wolf", blurb: "The Wolf rotates. Each hole they pick a partner or go Lone Wolf for double.", players: [4, 5], teams: false, teamFormat: false, points: true, holeInput: "wolf" },
  { id: "vegas", name: "Vegas", blurb: "2 v 2. Team scores make a 2-digit number (4 and 5 = 45). Low number wins the difference.", players: [4], teams: true, teamFormat: false, points: true },
  { id: "daytona", name: "Daytona", blurb: "Left pair v right pair, best ball. The middle player can't lose, and wins from everyone with the outright low.", players: [5], teams: false, teamFormat: false, points: true, holeInput: "daytona" },
  { id: "bbb", name: "Bingo Bango Bongo", blurb: "A point each for first on the green, closest once all are on, and first in.", players: [2, 3, 4, 5], teams: false, teamFormat: false, points: true, holeInput: "bbb" },
  { id: "nines", name: "Nines (5-3-1)", blurb: "9 points a hole: 5 for low, 3 for middle, 1 for high.", players: [3], teams: false, teamFormat: false, points: true },
  { id: "sixes", name: "Sixes", blurb: "2 v 2 best ball. Partners change every 6 holes.", players: [4], teams: false, teamFormat: false, points: true },
  { id: "snake", name: "Snake", blurb: "Whoever 3-putted last holds the snake at the end and pays everyone.", players: [2, 3, 4, 5], teams: false, teamFormat: false, points: false, holeInput: "snake" },
  { id: "scramble", name: "Scramble", blurb: "Team picks the best shot every time. Enter the team score for any one player.", players: [2, 3, 4, 5], teams: true, teamFormat: true, points: false },
  { id: "shamble", name: "Shamble", blurb: "Best drive, then everyone plays their own ball. Team's best score counts.", players: [2, 3, 4, 5], teams: true, teamFormat: true, points: false },
  { id: "alternate", name: "Alternate Shot", blurb: "Partners take turns hitting one ball. Enter the team score for either player.", players: [2, 4], teams: true, teamFormat: true, points: false },
  { id: "chapman", name: "Chapman", blurb: "Both drive, swap balls, pick one, then alternate. Enter the team score for either player.", players: [2, 4], teams: true, teamFormat: true, points: false },
];

export const gameDef = (id: GameId) => GAMES.find((game) => game.id === id)!;
export const gamesFor = (players: number) => GAMES.filter((game) => game.players.includes(players));

export interface GameConfig {
  id: GameId;
  /** Use handicap strokes (net) instead of gross. */
  net: boolean;
  birdiesDouble: boolean;
  /** Team 0 or 1 for each player (games with `teams`). */
  teams?: number[];
}

/** The extra tap per hole (by hole index). */
export interface HoleInput {
  /** Wolf: the Wolf's partner, or null for Lone Wolf. Undefined = not picked yet (hole doesn't score). */
  wolfPartner?: number | null;
  /** Daytona: who stood where on the tee. */
  daytona?: { left: [number, number]; middle: number; right: [number, number] };
  bbb?: { bingo?: number; bango?: number; bongo?: number };
  /** Snake: who 3-putted last on this hole (none = undefined). */
  snake?: number;
}

export interface GamePlayer { name: string; /** Handicap index, for net games. */ handicap: number | null }
export interface GameCourse { par: number[]; strokeIndex?: (number | null)[]; rating: number | null; slope: number | null }

export interface GameStanding {
  label: string;
  /** What shows next to the name ("+3", "2 UP", "38 pts", "72"). */
  value: string;
  /** Sort key: higher is better. */
  rank: number;
}
export interface GameResult { title: string; standings: GameStanding[]; /** One line under the standings (e.g. "Snake: Cam"). */ note?: string }

/** The Wolf on a hole: rotates through the group in order, starting with player 1 on the first hole played. */
export const wolfFor = (hole: number, range: [number, number], players: number) => (hole - range[0]) % players;

/** Sixes partners for a hole: A+B v C+D, then A+C v B+D, then A+D v B+C, changing every third of the round. */
export function sixesTeams(hole: number, range: [number, number]): [number[], number[]] {
  const third = Math.min(2, Math.floor((hole - range[0]) / ((range[1] - range[0]) / 3)));
  return ([[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]] as [number[], number[]][])[third];
}

/** Course handicap: index × slope / 113 + (rating − par), rounded; just the index when the tee has no rating. Halved for 9 holes. */
export function courseHandicap(index: number, course: GameCourse, range: [number, number]): number {
  const par = course.par.reduce((sum, p) => sum + p, 0);
  const full = course.rating != null && course.slope != null ? index * course.slope / 113 + (course.rating - par) : index;
  return Math.round(range[1] - range[0] === 9 ? full / 2 : full);
}

/** Handicap strokes a player gets on each hole in range: spread by stroke index (hardest first), more than one when needed. */
export function strokesReceived(handicap: number, course: GameCourse, range: [number, number]): number[] {
  const holes = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i);
  const order = [...holes].sort((a, b) => (course.strokeIndex?.[a] ?? a + 1) - (course.strokeIndex?.[b] ?? b + 1));
  const n = holes.length, abs = Math.abs(handicap), sign = Math.sign(handicap);
  const out = new Array<number>(course.par.length).fill(0);
  order.forEach((hole, rank) => {
    // Plus handicaps give strokes back on the easiest holes.
    const extra = sign >= 0 ? rank < abs % n : rank >= n - (abs % n);
    out[hole] = sign * (Math.floor(abs / n) + (extra ? 1 : 0));
  });
  return out;
}

const lowest = (values: number[]) => Math.min(...values);
const outrightLow = (values: number[]) => { const low = lowest(values); return values.filter((v) => v === low).length === 1 ? values.indexOf(low) : -1; };
const signed = (n: number) => n > 0 ? `+${n}` : String(n);

/**
 * Scores a game. `strokes[player][hole]` are gross scores (null = not entered). Holes where anyone is missing a score
 * are skipped, so standings are live "thru" the holes everyone has finished.
 */
export function scoreGame(config: GameConfig, players: GamePlayer[], course: GameCourse, range: [number, number],
  strokes: (number | null)[][], inputs: HoleInput[] = []): GameResult {
  const def = gameDef(config.id);
  const n = players.length;
  const received = players.map((p) => config.net && p.handicap != null ? strokesReceived(courseHandicap(p.handicap, course, range), course, range) : new Array<number>(course.par.length).fill(0));
  const holes = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i).filter((h) => strokes.every((row) => row[h] != null));
  const score = (p: number, h: number) => (strokes[p][h] as number) - received[p][h];
  const teams = config.teams ?? players.map((_, i) => (i < n / 2 ? 0 : 1));
  const side = (t: number) => players.map((_, i) => i).filter((i) => teams[i] === t);
  const sideName = (members: number[]) => members.map((i) => players[i].name).join(" & ");
  const best = (members: number[], h: number) => lowest(members.map((p) => score(p, h)));
  const birdie = (value: number, h: number) => config.birdiesDouble && value <= course.par[h] - 1 ? 2 : 1;
  const points = new Array<number>(n).fill(0);
  /** Each winner takes `each` points from each loser. */
  const pay = (winners: number[], losers: number[], each: number) => {
    for (const w of winners) for (const l of losers) { points[w] += each; points[l] -= each; }
  };
  const pointStandings = (title: string, note?: string): GameResult => ({
    title, note, standings: players.map((p, i) => ({ label: p.name, value: signed(points[i]), rank: points[i] })).sort((a, b) => b.rank - a.rank),
  });
  const thru = holes.length ? ` · thru ${holes.at(-1)! + 1}` : "";

  switch (config.id) {
    case "stroke": {
      const totals = players.map((_, p) => holes.reduce((sum, h) => sum + score(p, h), 0));
      const par = holes.reduce((sum, h) => sum + course.par[h], 0);
      return { title: `${def.name}${config.net ? " (net)" : ""}${thru}`, standings: players.map((p, i) => ({ label: p.name, value: `${totals[i]} (${totals[i] === par ? "E" : signed(totals[i] - par)})`, rank: -totals[i] })).sort((a, b) => b.rank - a.rank) };
    }
    case "stableford": {
      const pts = players.map((_, p) => holes.reduce((sum, h) => {
        const diff = score(p, h) - course.par[h];
        const base = Math.max(0, 2 - diff);
        return sum + base * birdie(score(p, h), h);
      }, 0));
      return { title: `${def.name}${thru}`, standings: players.map((p, i) => ({ label: p.name, value: `${pts[i]} pts`, rank: pts[i] })).sort((a, b) => b.rank - a.rank) };
    }
    case "match": case "nassau": {
      const [a, b] = n === 2 ? [[0], [1]] : [side(0), side(1)];
      const match = (from: number, to: number) => {
        let up = 0, played = 0;
        for (const h of holes) if (h >= from && h < to) { played++; const x = best(a, h), y = best(b, h); up += x < y ? 1 : x > y ? -1 : 0; }
        const left = to - from - (played);
        const status = up === 0 ? "All square" : `${up > 0 ? sideName(a) : sideName(b)} ${Math.abs(up)} UP`;
        return { up, label: played && Math.abs(up) > left ? `${status} (won)` : status, played };
      };
      if (config.id === "match") {
        const m = match(range[0], range[1]);
        return { title: `${def.name}${thru}`, standings: [{ label: sideName(a), value: m.up > 0 ? `${m.up} UP` : m.up === 0 ? "AS" : "", rank: m.up }, { label: sideName(b), value: m.up < 0 ? `${-m.up} UP` : m.up === 0 ? "AS" : "", rank: -m.up }], note: m.label };
      }
      const segments: [string, number, number][] = range[1] - range[0] === 18 ? [["Front", 0, 9], ["Back", 9, 18], ["Overall", 0, 18]] : [["Match", range[0], range[1]]];
      return { title: `${def.name}${thru}`, standings: segments.map(([label, from, to]) => { const m = match(from, to); return { label, value: m.label, rank: 0 }; }) };
    }
    case "bestball": case "shamble": case "scramble": case "alternate": case "chapman": {
      const sides = [side(0), side(1)].filter((s) => s.length);
      const totals = sides.map((s) => holes.reduce((sum, h) => sum + best(s, h), 0));
      return { title: `${def.name}${thru}`, standings: sides.map((s, i) => ({ label: sideName(s), value: String(totals[i]), rank: -totals[i] })).sort((x, y) => y.rank - x.rank) };
    }
    case "skins": {
      const skins = new Array<number>(n).fill(0);
      let pot = 0;
      for (const h of holes) {
        const scores = players.map((_, p) => score(p, h));
        pot += 1;
        const winner = outrightLow(scores);
        if (winner >= 0) { skins[winner] += pot * birdie(scores[winner], h); pot = 0; }
      }
      return { title: `${def.name}${thru}`, note: pot ? `${pot} skin${pot > 1 ? "s" : ""} carrying over` : undefined,
        standings: players.map((p, i) => ({ label: p.name, value: `${skins[i]} skin${skins[i] === 1 ? "" : "s"}`, rank: skins[i] })).sort((a, b) => b.rank - a.rank) };
    }
    case "wolf": {
      for (const h of holes) {
        const partner = inputs[h]?.wolfPartner;
        if (partner === undefined) continue;
        const wolf = wolfFor(h, range, n);
        const wolfSide = partner === null ? [wolf] : [wolf, partner];
        const others = players.map((_, i) => i).filter((i) => !wolfSide.includes(i));
        const x = best(wolfSide, h), y = best(others, h);
        if (x === y) continue;
        const each = (partner === null ? 2 : 1) * birdie(Math.min(x, y), h);
        if (x < y) pay(wolfSide, others, each); else pay(others, wolfSide, each);
      }
      return pointStandings(`${def.name}${thru}`);
    }
    case "vegas": {
      const [a, b] = [side(0), side(1)];
      const number = (members: number[], h: number) => { const [lo, hi] = members.map((p) => score(p, h)).sort((x, y) => x - y); return lo * 10 + hi; };
      for (const h of holes) {
        const x = number(a, h), y = number(b, h);
        if (x === y) continue;
        const winners = x < y ? a : b;
        pay(winners, x < y ? b : a, Math.abs(x - y) * birdie(best(winners, h), h));
      }
      return pointStandings(`${def.name}${thru}`);
    }
    case "daytona": {
      for (const h of holes) {
        const spot = inputs[h]?.daytona;
        if (!spot) continue;
        const scores = players.map((_, p) => score(p, h));
        const everyone = players.map((_, i) => i);
        // The middle player wins only with the outright low of all five; then the left / right result doesn't score.
        if (outrightLow(scores) === spot.middle) { pay([spot.middle], everyone.filter((i) => i !== spot.middle), birdie(scores[spot.middle], h)); continue; }
        const x = best(spot.left, h), y = best(spot.right, h);
        if (x === y) continue;
        pay(x < y ? spot.left : spot.right, x < y ? spot.right : spot.left, birdie(Math.min(x, y), h));
      }
      return pointStandings(`${def.name}${thru}`);
    }
    case "bbb": {
      for (const h of holes) {
        const got = inputs[h]?.bbb;
        if (!got) continue;
        for (const winner of [got.bingo, got.bango, got.bongo]) if (winner !== undefined) points[winner] += birdie(score(winner, h), h);
      }
      return { title: `${def.name}${thru}`, standings: players.map((p, i) => ({ label: p.name, value: `${points[i]} pts`, rank: points[i] })).sort((a, b) => b.rank - a.rank) };
    }
    case "nines": {
      for (const h of holes) {
        const scores = players.map((_, p) => score(p, h));
        const sorted = [...new Set(scores)].sort((x, y) => x - y);
        const split = sorted.length === 1 ? [3, 3, 3] : sorted.length === 3 ? null : scores.filter((s) => s === sorted[0]).length === 2 ? [4, 4, 1] : [5, 2, 2];
        const value = (s: number) => split ? (s === sorted[0] ? split[0] : split[2]) : s === sorted[0] ? 5 : s === sorted[1] ? 3 : 1;
        const double = birdie(sorted[0], h);
        scores.forEach((s, p) => { points[p] += value(s) * double; });
      }
      return { title: `${def.name}${thru}`, standings: players.map((p, i) => ({ label: p.name, value: `${points[i]} pts`, rank: points[i] })).sort((a, b) => b.rank - a.rank) };
    }
    case "sixes": {
      for (const h of holes) {
        const [a, b] = sixesTeams(h, range);
        const x = best(a, h), y = best(b, h);
        if (x === y) continue;
        pay(x < y ? a : b, x < y ? b : a, birdie(Math.min(x, y), h));
      }
      return pointStandings(`${def.name}${thru}`);
    }
    case "snake": {
      let holder: number | null = null;
      for (const h of holes) if (inputs[h]?.snake !== undefined) holder = inputs[h].snake!;
      if (holder !== null && holes.length === range[1] - range[0]) pay(players.map((_, i) => i).filter((i) => i !== holder), [holder], 1);
      return { ...pointStandings(`${def.name}${thru}`), note: holder === null ? "Nobody has the snake yet" : `${players[holder].name} has the snake` };
    }
  }
}
