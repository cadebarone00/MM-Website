import { courseHandicap, strokesReceived, type GameConfig, type GameCourse, type HoleInput } from "./roundGames";
import { foursomes, type TeeTiming } from "./codeTournaments";

/**
 * Leagues (project_specs.md "Feature: Leagues"): one round, one course, one day. The league's players play in groups
 * (one scorer per group); everything here is worked out from each player's own hole-by-hole strokes, so it's plain
 * and easy to test: the Gross / Net leaderboard, league-wide skins, and the 2-person pairs game drawn at random.
 * Holes are 0-based here; `null` = not played yet.
 */

export type LeagueScoring = "Gross" | "Net";
export type PairFormat = "bestball" | "combined" | "stableford-bestball" | "stableford-combined";
export type PairSegments = 6 | 9 | 18;
export type PairRule = "random" | "balanced" | "split-groups" | "keep-groups";

export interface LeaguePlayer { profileId: string; name: string; handicap: number | null }
/** A playing group. `game` / `inputs`: the group's own game, picked by its scorer, exactly like Play a round (roundGames). */
export interface LeagueGroup { number: number; time: string; hole: number; scorer: string; players: string[]; game?: GameConfig | null; inputs?: HoleInput[]; /** The scorer submitted the card; the group's scores are locked. */ submitted?: boolean }
export interface LeagueCourse { ref?: string; name: string; place: string | null; par: number[]; strokeIndex: number[] | null; tee: { name: string; rating: number | null; slope: number | null } | null }
export interface League {
  id: string; code: string; name: string; organizer: string; date: string; status: "live" | "ended";
  course: LeagueCourse; scoring: LeagueScoring;
  players: LeaguePlayer[]; groups: LeagueGroup[];
  skins: { on: boolean; net: boolean; carryover: boolean };
  pairs: { on: boolean; format: PairFormat; net: boolean; segments: PairSegments; rule: PairRule; locked: boolean; teams: string[][] };
  holes: { profileId: string; hole: number; strokes: number }[];
}

export const PAIR_FORMATS: { id: PairFormat; name: string; blurb: string }[] = [
  { id: "bestball", name: "Best Ball", blurb: "The lower of the two scores on each hole. Lowest total wins." },
  { id: "combined", name: "Combined", blurb: "Both scores added on each hole. Lowest total wins." },
  { id: "stableford-bestball", name: "Stableford Best Ball", blurb: "The better of the two players' points on each hole (par 2, birdie 3, eagle 4). Most points wins." },
  { id: "stableford-combined", name: "Stableford Combined", blurb: "Both players' points added on each hole. Most points wins." },
];
export const PAIR_RULES: { id: PairRule; name: string; blurb: string }[] = [
  { id: "random", name: "Random", blurb: "A plain shuffle." },
  { id: "balanced", name: "Balanced (A-B draw)", blurb: "Each pair gets one player from the better half by handicap and one from the other half." },
  { id: "split-groups", name: "Split up groups", blurb: "Partners come from different playing groups." },
  { id: "keep-groups", name: "Keep groups together", blurb: "Partners play in the same group." },
];
export const SEGMENT_OPTIONS: { value: PairSegments; name: string }[] = [
  { value: 6, name: "Every 6 holes" }, { value: 9, name: "Front 9 & Back 9" }, { value: 18, name: "18 holes" },
];

const HOLES = 18;
export const gameCourse = (course: LeagueCourse): GameCourse => ({ par: course.par, strokeIndex: course.strokeIndex ?? undefined, rating: course.tee?.rating ?? null, slope: course.tee?.slope ?? null });

/** A group's players in game order: the scorer first (Play a round's player 0 is the scorekeeper), then the rest. */
export const groupOrder = (group: LeagueGroup) => [group.scorer, ...group.players.filter((id) => id !== group.scorer)];

/** Each player's 18 holes of strokes (null = not played). */
export function cardOf(league: League, profileId: string): (number | null)[] {
  const card: (number | null)[] = Array.from({ length: HOLES }, () => null);
  for (const h of league.holes) if (h.profileId === profileId && h.hole >= 1 && h.hole <= HOLES) card[h.hole - 1] = h.strokes;
  return card;
}

/** Handicap strokes a player gets on each hole (all zero for no handicap). */
export function strokesFor(league: League, player: LeaguePlayer): number[] {
  if (player.handicap == null) return new Array<number>(HOLES).fill(0);
  const course = gameCourse(league.course);
  return strokesReceived(courseHandicap(player.handicap, course, [0, HOLES]), course, [0, HOLES]);
}

/** The score that counts on each hole: gross strokes, or net (strokes less handicap strokes). */
export function countedCard(league: League, player: LeaguePlayer, net: boolean): (number | null)[] {
  const given = net ? strokesFor(league, player) : null;
  return cardOf(league, player.profileId).map((s, h) => s == null ? null : given ? s - given[h] : s);
}

export interface LeaderboardRow { profileId: string; name: string; total: number | null; toPar: number | null; thru: number; position: number | null }

/** The first screen: everyone's total so far (gross or net), lowest to par first; anyone yet to start goes last. */
export function leaderboard(league: League, scoring: LeagueScoring): LeaderboardRow[] {
  const rows = league.players.map((player) => {
    const card = countedCard(league, player, scoring === "Net");
    const played = card.map((s, h) => s == null ? null : h).filter((h): h is number => h != null);
    const total = played.length ? played.reduce((sum, h) => sum + card[h]!, 0) : null;
    const par = played.reduce((sum, h) => sum + league.course.par[h], 0);
    return { profileId: player.profileId, name: player.name, total, toPar: total == null ? null : total - par, thru: played.length, position: null as number | null };
  });
  rows.sort((a, b) => a.toPar == null ? (b.toPar == null ? a.name.localeCompare(b.name) : 1) : b.toPar == null ? -1 : a.toPar - b.toPar || b.thru - a.thru || a.name.localeCompare(b.name));
  // Ties share a position (T2 shows as 2 for each).
  rows.forEach((row, i) => { if (row.toPar != null) row.position = i > 0 && rows[i - 1].toPar === row.toPar ? rows[i - 1].position : i + 1; });
  return rows;
}

export interface SkinHole { hole: number; winner: string | null; score: number | null; value: number; status: "won" | "tied" | "open" }
export interface SkinsResult { holes: SkinHole[]; totals: { profileId: string; name: string; skins: number }[]; carried: number }

/**
 * League-wide skins: on each hole, the outright low score among every player in the league wins the skin. A hole is
 * decided once everyone has a score on it. Ties carry the skin to the next hole (carryover on) or nobody wins it.
 */
export function skins(league: League): SkinsResult {
  const cards = league.players.map((p) => ({ player: p, card: countedCard(league, p, league.skins.net) }));
  let carry = 0;
  const holes: SkinHole[] = [];
  for (let h = 0; h < HOLES; h++) {
    const scores = cards.map((c) => c.card[h]);
    const value = 1 + carry;
    if (!cards.length || scores.some((s) => s == null)) { holes.push({ hole: h + 1, winner: null, score: null, value, status: "open" }); continue; }
    const low = Math.min(...(scores as number[]));
    const at = cards.filter((c) => c.card[h] === low);
    if (at.length === 1) { holes.push({ hole: h + 1, winner: at[0].player.profileId, score: low, value, status: "won" }); carry = 0; }
    else { holes.push({ hole: h + 1, winner: null, score: low, value, status: "tied" }); carry = league.skins.carryover ? value : 0; }
  }
  const totals = league.players.map((p) => ({ profileId: p.profileId, name: p.name, skins: holes.filter((s) => s.winner === p.profileId).reduce((sum, s) => sum + s.value, 0) }))
    .filter((t) => t.skins > 0).sort((a, b) => b.skins - a.skins || a.name.localeCompare(b.name));
  return { holes, totals, carried: carry };
}

/** A shuffle that takes its own random numbers, so draws can be tested. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const chunkPairs = (ids: string[]) => Array.from({ length: Math.floor(ids.length / 2) }, (_, i) => [ids[2 * i], ids[2 * i + 1]]);

/** An odd player out joins a random pair, making one team of 3. */
function placeLeftover(pairs: string[][], leftover: string[], random: () => number): string[][] {
  const out = pairs.map((p) => [...p]);
  for (const id of leftover) {
    if (!out.length) out.push([id]);
    else out[Math.floor(random() * out.length)].push(id);
  }
  return out;
}

/**
 * Draws the 2-person teams by the organizer's rule. Every player ends up in exactly one team; with an odd number one
 * team has 3. `random` is Math.random in the app (tests pass their own).
 */
export function drawPairs(league: Pick<League, "players" | "groups">, rule: PairRule, random: () => number = Math.random): string[][] {
  const ids = league.players.map((p) => p.profileId);
  const groupOf = new Map<string, number>();
  for (const g of league.groups) for (const id of g.players) groupOf.set(id, g.number);

  if (rule === "balanced") {
    // Lowest handicaps first; no handicap counts as the highest.
    const ranked = [...league.players].sort((a, b) => (a.handicap ?? 99) - (b.handicap ?? 99)).map((p) => p.profileId);
    const half = Math.floor(ranked.length / 2);
    const top = shuffle(ranked.slice(0, half), random), bottom = shuffle(ranked.slice(half), random);
    return placeLeftover(top.map((id, i) => [id, bottom[i]]), bottom.slice(top.length), random);
  }
  if (rule === "keep-groups") {
    const pairs: string[][] = [], singles: string[] = [];
    for (const g of league.groups) {
      const mixed = shuffle(g.players.filter((id) => ids.includes(id)), random);
      pairs.push(...chunkPairs(mixed));
      if (mixed.length % 2) singles.push(mixed[mixed.length - 1]);
    }
    // Anyone not in a group, and the odd one out of each group, are paired together.
    const loose = shuffle([...singles, ...ids.filter((id) => !groupOf.has(id))], random);
    pairs.push(...chunkPairs(loose));
    return placeLeftover(pairs, loose.length % 2 ? [loose[loose.length - 1]] : [], random);
  }
  if (rule === "split-groups") {
    // Try a few shuffles for one where nobody is paired with someone from their own group; keep the best one found.
    let best: string[][] = [], bestClashes = Infinity;
    for (let attempt = 0; attempt < 50 && bestClashes > 0; attempt++) {
      const open = shuffle(ids, random), pairs: string[][] = [];
      while (open.length > 1) {
        const first = open.shift()!;
        const at = open.findIndex((id) => groupOf.get(id) == null || groupOf.get(id) !== groupOf.get(first));
        pairs.push([first, open.splice(at >= 0 ? at : 0, 1)[0]]);
      }
      const drawn = placeLeftover(pairs, open, random);
      const clashes = drawn.reduce((sum, team) => sum + team.filter((id, i) => team.some((other, j) => j !== i && groupOf.get(id) != null && groupOf.get(id) === groupOf.get(other))).length, 0);
      if (clashes < bestClashes) { best = drawn; bestClashes = clashes; }
    }
    return best;
  }
  const mixed = shuffle(ids, random);
  return placeLeftover(chunkPairs(mixed), mixed.length % 2 ? [mixed[mixed.length - 1]] : [], random);
}

/** Stableford points for a hole score: par 2, birdie 3, eagle 4, bogey 1, worse 0. */
export const stablefordPoints = (score: number, par: number) => Math.max(0, 2 + par - score);

/** Hole ranges for the pairs winners: [start, end) for each segment. */
export function segmentsOf(segments: PairSegments): [number, number][] {
  return Array.from({ length: HOLES / segments }, (_, i) => [i * segments, (i + 1) * segments] as [number, number]);
}
export const segmentLabel = ([start, end]: [number, number]) => end - start === HOLES ? "18 holes" : end - start === 9 ? (start === 0 ? "Front 9" : "Back 9") : `Holes ${start + 1}–${end}`;

/** Points formats: most wins. Strokes formats: fewest wins. */
export const pairsByPoints = (format: PairFormat) => format.startsWith("stableford");

/** A team's score on one hole, once every teammate has a score there (null before). */
export function teamHole(league: League, team: string[], hole: number): number | null {
  const { format, net } = league.pairs;
  const scores: number[] = [];
  for (const id of team) {
    const player = league.players.find((p) => p.profileId === id);
    const s = player ? countedCard(league, player, net)[hole] : null;
    if (s == null) return null;
    scores.push(pairsByPoints(format) ? stablefordPoints(s, league.course.par[hole]) : s);
  }
  if (!scores.length) return null;
  const sorted = [...scores].sort((a, b) => pairsByPoints(format) ? b - a : a - b);
  // Best ball takes the best score; combined takes the best two (a team of 3 counts its best 2).
  return format === "bestball" || format === "stableford-bestball" ? sorted[0] : sorted.slice(0, 2).reduce((sum, s) => sum + s, 0);
}

/** `total` = strokes (or points for Stableford); `toPar` = strokes against par for the holes played (strokes formats only). */
export interface PairStanding { team: string[]; names: string; total: number | null; toPar: number | null; thru: number; position: number | null }
export interface PairSegment { range: [number, number]; label: string; standings: PairStanding[]; final: boolean; winners: string[][] }

/** Par for a team on a hole: best ball plays one ball's par, combined adds par for each score that counts (2). */
export const teamPar = (league: League, team: string[], hole: number) => league.course.par[hole] * (league.pairs.format === "combined" ? Math.min(2, team.length) : 1);

/** The pairs leaderboard for each segment (6, 9 or 18 holes): strokes formats by score to par, Stableford by points.
 *  A segment is final once every team has played all its holes. */
export function pairResults(league: League): PairSegment[] {
  const byPoints = pairsByPoints(league.pairs.format);
  const nameOf = (id: string) => league.players.find((p) => p.profileId === id)?.name ?? "Player";
  return segmentsOf(league.pairs.segments).map((range) => {
    const standings: PairStanding[] = league.pairs.teams.map((team) => {
      const played = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i).flatMap((hole) => { const score = teamHole(league, team, hole); return score == null ? [] : [{ hole, score }]; });
      const total = played.length ? played.reduce((sum, h) => sum + h.score, 0) : null;
      const toPar = total == null || byPoints ? null : total - played.reduce((sum, h) => sum + teamPar(league, team, h.hole), 0);
      return { team, names: team.map(nameOf).join(" & "), total, toPar, thru: played.length, position: null };
    });
    // Points: most first. Strokes: lowest to par first (fair while teams are on different holes).
    const rank = (row: PairStanding) => byPoints ? -(row.total ?? 0) : row.toPar ?? 0;
    standings.sort((a, b) => a.total == null ? (b.total == null ? 0 : 1) : b.total == null ? -1 : rank(a) - rank(b) || b.thru - a.thru);
    standings.forEach((row, i) => { if (row.total != null) row.position = i > 0 && standings[i - 1].total != null && rank(standings[i - 1]) === rank(row) ? standings[i - 1].position : i + 1; });
    const length = range[1] - range[0];
    const final = standings.length > 0 && standings.every((row) => row.thru === length);
    return { range, label: segmentLabel(range), standings, final, winners: final ? standings.filter((row) => row.position === 1).map((row) => row.team) : [] };
  });
}

/** "-2", "E", "+3". */
export const toParLabel = (value: number | null) => value == null ? "–" : value === 0 ? "E" : value > 0 ? `+${value}` : String(value);

/** What a code shows before joining (the Join screen). */
export interface LeagueLookup { id: string; name: string; status: "live" | "ended"; scoring: LeagueScoring; organizerName: string; course: string; date: string; member: boolean; playerCount: number }
/** A league on the Leagues tab. */
export interface MyLeague { id: string; name: string; status: "live" | "ended"; date: string; course: string; playerCount: number }

/** Live first, then upcoming, then past (the Leagues tab). A live league dated before today still shows as live. */
export function leagueSection(league: Pick<MyLeague, "status" | "date">, today: string): "Live" | "Upcoming" | "Past" {
  if (league.status === "ended") return "Past";
  return league.date > today ? "Upcoming" : "Live";
}

/**
 * Every change the league page sends (POST /api/leagues/<id>). The same list is applied on the page for the preview
 * (applyLeagueChange), so the preview behaves like the real thing.
 */
export type LeagueChange =
  | { action: "settings"; scoring: LeagueScoring; skins: League["skins"]; pairs: League["pairs"] }
  | { action: "groups"; groups: { time: string; hole: number; scorer: string; players: string[] }[] }
  | { action: "strokes"; player: string; hole: number; strokes: number | null }
  | { action: "game"; group: number; game: GameConfig | null; inputs: HoleInput[] }
  | { action: "submit"; group: number }
  | { action: "end" };

/** A change applied on the page (the preview; the server does the same, with its own checks). Holes are 1-based. */
export function applyLeagueChange(league: League, change: LeagueChange): League {
  switch (change.action) {
    case "settings": return { ...league, scoring: change.scoring, skins: change.skins, pairs: change.pairs };
    case "groups": return { ...league, groups: change.groups.map((g, i) => {
      const before = league.groups[i];
      const same = before && before.players.join() === g.players.join();
      return { number: i + 1, ...g, scorer: g.players.includes(g.scorer) ? g.scorer : g.players[0], game: same ? before.game : null, inputs: same ? before.inputs : [], submitted: same ? before.submitted : false };
    }) };
    case "strokes": {
      const holes = league.holes.filter((h) => !(h.profileId === change.player && h.hole === change.hole));
      return { ...league, holes: change.strokes == null ? holes : [...holes, { profileId: change.player, hole: change.hole, strokes: change.strokes }] };
    }
    case "game": return { ...league, groups: league.groups.map((g) => g.number === change.group ? { ...g, game: change.game, inputs: change.inputs } : g) };
    case "submit": return { ...league, groups: league.groups.map((g) => g.number === change.group ? { ...g, submitted: true } : g) };
    case "end": return { ...league, status: "ended" };
  }
}

/**
 * Make tee times: everyone shuffled into foursomes (threesomes when it doesn't divide by four), timed like a tournament's
 * tee sheet. Each group's scorer starts as its first player; the organizer can change any of it.
 */
export function makeTeeTimes(players: string[], timing: TeeTiming, random: () => number = Math.random): { time: string; hole: number; scorer: string; players: string[] }[] {
  return foursomes(shuffle(players, random), timing, HOLES).groups.map((g) => ({ ...g, scorer: g.players[0] }));
}

/** Players not in any group yet (they joined after the tee times were made). */
export const ungrouped = (league: Pick<League, "players" | "groups">) => league.players.filter((p) => !league.groups.some((g) => g.players.includes(p.profileId)));
