import { normalizeCompetitor, type GolfMatchPreview } from "./golfTripPreviewFixture";
import { GAMES, gameDef, scoreGame, type GameConfig, type GameCourse, type GameId, type GamePlayer, type GameResult, type HoleInput } from "./roundGames";

/**
 * Golf trip → Games (owner request 2026-10-17): the same games as Play a round (lib/platform/roundGames.ts — scored by
 * the same `scoreGame`), played only with people in your group, for a round you choose, scored from the round's
 * scorecard (the leaderboard's hole scores).
 */

/** A trip game as saved: which round, the game and its options, the players (by name), each hole's extra pick, and
 *  whether the pre-round options are done (`started`). */
export interface TripGame { key: string; round: number; config: GameConfig; players: string[]; inputs: HoleInput[]; started?: boolean;
  /** The round's saved pars (saved trips); unset = the shown round's pars. */
  pars?: number[] | null }

/** Who I am on the trip: the signed-in player (matched by name), else the first player of the first match. */
export function meOn(match: GolfMatchPreview, signedInName?: string | null): string | undefined {
  const want = signedInName?.trim().toLowerCase();
  const mine = want ? match.leaderboard.find((row) => row.golfer.name.trim().toLowerCase() === want)?.golfer.name : undefined;
  if (mine) return mine;
  const first = match.matches[0];
  return (first ? normalizeCompetitor(first.left).golfers[0]?.name : undefined) ?? match.leaderboard[0]?.golfer.name;
}

/**
 * My group for the round: everyone on my tee time (when tee times split the field into groups of 2–5), otherwise the
 * players in my match (a four-ball is a group). Me first.
 */
export function groupOf(match: GolfMatchPreview, me: string): string[] {
  const myTee = match.leaderboard.find((row) => row.golfer.name === me)?.golfer.teeTime;
  const byTee = myTee ? match.leaderboard.filter((row) => row.golfer.teeTime === myTee).map((row) => row.golfer.name) : [];
  let group = byTee.length >= 2 && byTee.length <= 5 ? byTee : [];
  if (!group.length) {
    const pairing = match.matches.find((p) => [p.left, p.right].some((side) => side && normalizeCompetitor(side).golfers.some((g) => g.name === me)));
    group = pairing ? [pairing.left, pairing.right].flatMap((side) => side ? normalizeCompetitor(side).golfers.map((g) => g.name) : []) : [me];
  }
  return [me, ...group.filter((name) => name !== me)];
}

/** The game's players with handicaps (0 in preview data = unknown, as elsewhere). */
export function gamePlayers(match: GolfMatchPreview, names: string[]): GamePlayer[] {
  return names.map((name) => { const hcp = match.leaderboard.find((row) => row.golfer.name === name)?.golfer.hcp; return { name, handicap: hcp ? hcp : null }; });
}

/** Each player's hole scores from the round's scorecard; empty when the shown round isn't the game's round. */
export function gameStrokes(match: GolfMatchPreview, game: Pick<TripGame, "round" | "players">): (number | null)[][] {
  return game.players.map((name) => match.round === game.round ? [...(match.leaderboard.find((row) => row.golfer.name === name)?.holes ?? [])] : [])
    .map((holes) => match.par.map((_, h) => holes[h] ?? null));
}

/** The hole being played: the first hole someone in the game hasn't scored (the last hole once everyone's done). */
export function currentHole(strokes: (number | null)[][], holes: number): number {
  const next = Array.from({ length: holes }, (_, h) => h).find((h) => strokes.some((row) => row[h] == null));
  return next ?? holes - 1;
}

/** Holes everyone in the game has scored. */
export const holesThru = (strokes: (number | null)[][], holes: number) => Array.from({ length: holes }, (_, h) => h).filter((h) => strokes.every((row) => row[h] != null)).length;

export const gameCourse = (match: GolfMatchPreview): GameCourse => ({ par: match.par, rating: null, slope: null });

/**
 * Snake from the scorecard: on each hole, who 3-putted (most putts wins a tie; then the later player in the game).
 * Holes nobody 3-putted are left empty, so the snake stays where it was.
 */
export function snakeFromPutts(match: GolfMatchPreview, game: Pick<TripGame, "round" | "players">): HoleInput[] {
  if (match.round !== game.round) return [];
  const putts = game.players.map((name) => match.leaderboard.find((row) => row.golfer.name === name)?.putts ?? []);
  return match.par.map((_, h) => {
    let holder: number | undefined, most = 2;
    putts.forEach((row, p) => { const n = row[h]; if (n != null && n >= 3 && n >= most) { holder = p; most = n; } });
    return holder === undefined ? {} : { snake: holder };
  });
}

/** Par of the holes everyone in the game has finished (to show a team total against par). */
export const parThru = (match: GolfMatchPreview, strokes: (number | null)[][]) =>
  match.par.reduce((sum, par, h) => strokes.every((row) => row[h] != null) ? sum + par : sum, 0);

/** The teams on a hole: that hole's pick, else the last hole picked before it, else the game's starting teams. */
export function teamsOn(game: Pick<TripGame, "config" | "inputs" | "players">, hole: number): number[] {
  for (let h = hole; h >= 0; h--) if (game.inputs[h]?.teams) return game.inputs[h].teams!;
  return game.config.teams ?? game.players.map((_, i) => i < game.players.length / 2 ? 0 : 1);
}

/**
 * Vegas with teams chosen hole by hole: each finished hole is scored by Play's own Vegas (`scoreGame`) with that hole's
 * teams, and the points are added up. A hole only counts with two players on each side.
 */
export function vegasByHole(game: TripGame, players: GamePlayer[], course: GameCourse, strokes: (number | null)[][]): GameResult {
  const holes = course.par.length;
  const points = players.map(() => 0);
  let thru = 0;
  for (let h = 0; h < holes; h++) {
    if (!strokes.every((row) => row[h] != null)) continue;
    thru++;
    const teams = teamsOn(game, h);
    if (teams.filter((t) => t === 0).length !== 2 || teams.filter((t) => t === 1).length !== 2) continue;
    const only = strokes.map((row) => row.map((s, i) => i === h ? s : null));
    const result = scoreGame({ ...game.config, teams }, players, course, [0, holes], only, []);
    for (const s of result.standings) { const p = players.findIndex((pl) => pl.name === s.label); if (p >= 0) points[p] += Number(s.value.replace("+", "")) || 0; }
  }
  const signed = (n: number) => n > 0 ? `+${n}` : String(n);
  return { title: `Vegas${thru ? ` · thru ${thru}` : ""}`, standings: players.map((p, i) => ({ label: p.name, value: signed(points[i]), rank: points[i] })).sort((a, b) => b.rank - a.rank) };
}

/** Organizer → Games uses its own game list; these are the matching Play games (Coin Flip has none yet). */
/**
 * Play's games that make sense on a trip (owner rule 2026-10-22): side games only. The team formats (Scramble, Shamble,
 * Alternate Shot, Chapman) change how the round is played, which the organizer's schedule already decides, and Stroke Play /
 * Stableford repeat the trip leaderboard.
 */
const NOT_ON_TRIPS: GameId[] = ["stroke", "stableford", "scramble", "shamble", "alternate", "chapman"];
export const TRIP_GAMES = GAMES.filter((game) => !NOT_ON_TRIPS.includes(game.id));

export const ORGANIZER_GAME_TO_PLAY: Record<string, GameId> = { skins: "skins", "match-play": "match", "9-point": "nines", wolf: "wolf", vegas: "vegas", "round-robin": "sixes" };

/**
 * The games the organizer put on a round, as my group's games (owner request 2026-10-19): every group plays its own
 * copy, with as many of the group as the game takes (me first). Games already made for that round, game and players
 * aren't made again. A game that can't fit the group is skipped.
 */
export function organizerGames(allocations: Record<string, GameId[]> | undefined, group: string[], existing: TripGame[]): TripGame[] {
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  return Object.entries(allocations ?? {}).flatMap(([round, ids]) => ids.filter((id) => !NOT_ON_TRIPS.includes(id)).flatMap((id): TripGame[] => {
    const def = gameDef(id);
    const size = [...def.players].sort((a, b) => b - a).find((n) => n <= group.length);
    if (!size) return [];
    const players = group.slice(0, size);
    if (existing.some((g) => g.round === Number(round) && g.config.id === id && same(g.players, players))) return [];
    return [{ key: `organizer-${round}-${id}`, round: Number(round), players, inputs: [], started: !(def.teams && id !== "vegas"),
      config: { id, net: false, birdiesDouble: false, ...(def.teams ? { teams: players.map((_, i) => i < players.length / 2 ? 0 : 1) } : {}) } }];
  }));
}
