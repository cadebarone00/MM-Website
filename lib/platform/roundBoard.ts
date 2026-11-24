import { holeRange, type PersonalRoundSetup } from "./personalRound.ts";
import { gameDef, moneyByHole, scoreGame, type GameResult, type HoleInput } from "./roundGames.ts";
import { sideGameMoney } from "./sideGames.ts";
import { guestStrokes, playerStrokes } from "./sharedRoundCards.ts";
import type { SharedRound } from "./sharedRoundTypes.ts";

/**
 * A Play round's live board, shared by the website (components/platform/PlayRound.tsx) and the Expo app (mobile/):
 * who's in the round in playing order, the game's live result and money, and the leaderboard's rows. Pure, so both
 * show the exact same positions, totals and $ (docs/architecture/app-first.md, rule 13).
 */

/** One person in the round's game, in playing order. `strokes` = what's been entered for them, by hole index (18 long). */
export type BoardPerson = { key: string; name: string; handicap: number | null; strokes: (number | null)[] };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Everyone in a round with friends, before ordering: invited / joined players by position (you = "You", others by first
 * name; the host's handicap from setup.myHandicap, a friend's from setup.players), then guests. `strokesOf` / `guestRow`
 * let a screen show its own not-yet-confirmed changes; by default they read the round.
 */
export function roundPeople(round: Pick<SharedRound, "host" | "players" | "holes" | "guestHoles" | "setup">, me: string,
  strokesOf: (profileId: string) => (number | null)[] = (id) => playerStrokes(round, id),
  guestRow: (guestId: string) => (number | null)[] = (id) => guestStrokes(round, id)): BoardPerson[] {
  const { setup } = round;
  const active = round.players.filter((p) => p.status === "invited" || p.status === "joined").sort((a, b) => a.position - b.position);
  const handicapFor = (profileId: string) => profileId === round.host ? setup.myHandicap ?? null : setup.players?.find((x) => x.profileId === profileId)?.handicap ?? null;
  return [
    ...active.map((p) => ({ key: p.profileId, name: p.profileId === me ? "You" : firstName(p.name), handicap: handicapFor(p.profileId), strokes: strokesOf(p.profileId) })),
    ...(setup.guests ?? []).map((g) => ({ key: g.id, name: firstName(g.name), handicap: g.handicap, strokes: guestRow(g.id) })),
  ];
}

/** The game picks (Wolf partner, doubles, side-game winners…) by hole index, 18 long. */
export const picksByHole = (picks: SharedRound["picks"]) => Array.from({ length: 18 }, (_, h) => picks.find((k) => k.hole === h + 1)?.pick ?? {});

/** The playing order (Round settings): the host's chosen / shuffled order, else players then guests. */
export function orderPeople(people: BoardPerson[], playerOrder: string[] | undefined): BoardPerson[] {
  const orderOf = (key: string) => { const i = playerOrder?.indexOf(key) ?? -1; return i < 0 ? 100 + people.findIndex((x) => x.key === key) : i; };
  return [...people].sort((a, b) => orderOf(a.key) - orderOf(b.key));
}

/** The game, side games and money for the round right now (what's actually been entered, no par for untouched holes). */
export function roundGameView(setup: PersonalRoundSetup, ordered: BoardPerson[], inputs: HoleInput[]) {
  const range = holeRange(setup.holes);
  const par = setup.course.par;
  const gamePlayers = ordered.map((x) => ({ name: x.name, handicap: x.handicap }));
  const gameCourse = { par, strokeIndex: setup.course.strokeIndex, rating: setup.tee?.rating ?? null, slope: setup.tee?.slope ?? null };
  const def = setup.game ? gameDef(setup.game.id) : null;
  const gameFits = !def || def.players.includes(gamePlayers.length);
  const entered = ordered.map((x) => x.strokes);
  const result: GameResult | null = setup.game && gameFits ? scoreGame(setup.game, gamePlayers, gameCourse, range, entered, inputs) : null;
  const gameHoleMoney = setup.game && gameFits ? moneyByHole(setup.game, gamePlayers, gameCourse, range, entered, inputs) : null;
  // Side games (greenies, longest drive, closest to the pin): their $ adds into the leaderboard's $ and the P&L rows.
  const sideMoney = sideGameMoney(setup.sideGames, ordered.length, par, range, inputs);
  const holeMoney = !sideMoney ? gameHoleMoney : ordered.map((_, p) => par.map((__, h) => {
    const a = gameHoleMoney?.[p][h] ?? null, b = sideMoney.byHole[p][h];
    return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
  }));
  const doubled = inputs.map((i) => setup.game?.doubles === true && i.doubled === true);
  const rows = ordered.map((x) => ({ name: x.name, strokes: x.strokes }));
  return { range, par, def, gameFits, gamePlayers, gameCourse, result, holeMoney, sideMoney, extraMoney: sideMoney?.total ?? null, doubled, rows };
}

export type LeaderboardLine = {
  name: string; strokes: (number | null)[]; played: number; toPar: number; position: string; total: string;
  tone: "under" | "even" | "over" | undefined; gameValue: string | null; cash: number; pnl: (number | null)[] | null;
};

/**
 * The leaderboard (owner 2026-11-21/22): trip-style POS · PLAYER · TOT, a SKINS column for Skins only, and $ when there's
 * money. Sorted by the game's rank, then to par; ties share a place (T2). `hole` = the hole on screen, else the first hole
 * not everyone has finished.
 */
export function leaderboardLines({ rows, par, range, result, holeMoney = null, extraMoney = null, hole }: {
  rows: { name: string; strokes: (number | null)[] }[]; par: number[]; range: [number, number]; result: GameResult | null;
  holeMoney?: (number | null)[][] | null; extraMoney?: number[] | null; hole?: number;
}) {
  const holes = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i);
  const done = holes.filter((h) => rows.every((row) => row.strokes[h] != null));
  const now = hole ?? holes.find((h) => !done.includes(h)) ?? range[1] - 1;
  const game = new Map((result?.standings ?? []).map((s) => [s.label, s]));
  const perPlayer = rows.every((row) => game.has(row.name));
  const hasMoney = (perPlayer && rows.some((row) => game.get(row.name)?.money !== undefined)) || Boolean(extraMoney);
  const skins = Boolean(result && perPlayer && /skins?$/.test(game.get(rows[0]?.name)?.value ?? ""));
  const sorted = rows.map((row, index) => {
    const played = holes.filter((h) => row.strokes[h] != null);
    const toPar = played.reduce((sum, h) => sum + (row.strokes[h]! - par[h]), 0);
    const standing = perPlayer ? game.get(row.name) : undefined;
    return { ...row, played: played.length, toPar, standing, pnl: holeMoney?.[index] ?? null, cash: (standing?.money ?? 0) + (extraMoney?.[index] ?? 0) };
  }).sort((a, b) => (b.standing?.rank ?? 0) - (a.standing?.rank ?? 0) || (a.played && b.played ? a.toPar - b.toPar : b.played - a.played));
  const key = (line: typeof sorted[number]) => `${line.standing?.rank ?? 0}|${line.played ? line.toPar : "x"}`;
  const lines: LeaderboardLine[] = sorted.map((line) => {
    const first = sorted.findIndex((l) => key(l) === key(line));
    const tied = sorted.filter((l) => key(l) === key(line)).length > 1;
    return {
      name: line.name, strokes: line.strokes, played: line.played, toPar: line.toPar, pnl: line.pnl, cash: line.cash,
      position: `${tied ? "T" : ""}${first + 1}`,
      total: !line.played ? "–" : line.toPar === 0 ? "E" : line.toPar > 0 ? `+${line.toPar}` : String(line.toPar),
      tone: !line.played ? undefined : line.toPar < 0 ? "under" : line.toPar === 0 ? "even" : "over",
      gameValue: skins ? (line.standing ? line.standing.value.replace(/\s*(skins?|pts)$/, "") : "—") : null,
    };
  });
  const head = `Hole ${now + 1}${done.length ? ` · thru ${done.at(-1)! + 1}` : ""}${result ? ` · ${result.title.split(" · ")[0]}` : ""}`;
  return { lines, now, done, head, skins, hasMoney, perPlayer, note: result?.note ?? null };
}

/** A score's scorecard mark (owner 2026-11-22): circle = birdie, double circle = eagle or better, square = bogey, double
 *  square = double bogey or worse; par has none. */
export const scoreMark = (vsPar: number) => vsPar <= -2 ? "eagle" : vsPar === -1 ? "birdie" : vsPar === 0 ? "par" : vsPar === 1 ? "bogey" : "double";

/** A player's scorecard nines for the holes played (front, back or both), as hole indexes. */
export function cardNines(range: [number, number]): number[][] {
  return [[0, 9], [9, 18]].filter(([a, b]) => a < range[1] && b > range[0]).map(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i));
}

/** A nine's total, or null when nothing's in yet. */
export const nineTotal = (holes: number[], values: (number | null)[]) => holes.some((h) => values[h] != null) ? holes.reduce((t, h) => t + (values[h] ?? 0), 0) : null;

/** A $ cell on the scorecard's P&L row: "+5", "−3", "–" for even, "" for none. */
export const cashCell = (n: number | null) => n == null ? "" : n === 0 ? "–" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
