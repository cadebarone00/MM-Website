import { holeRange, type HolesChoice } from "./personalRound.ts";
import { wolfFor, type HoleInput } from "./roundGames.ts";
import type { HolePenalties, ScoredCard, ShotResult } from "./playerRounds.ts";

/**
 * Play a round → keeping score, shared by the website (components/platform/PlayRound.tsx) and the Expo app (mobile/):
 * what Next hole sends, how a hole's game taps change, and the card Submit & Save sends. Pure, so both keep score the
 * same way (docs/architecture/app-first.md, rule 13).
 */

/**
 * Next hole (scorekeeper): every player's score for the hole goes to the round, so the leaderboard updates. The
 * scorekeeper's own score is what their box shows (par when untouched) and is sent only when the round has something
 * else; anyone else with nothing entered yet gets par.
 */
export function finishHoleSends({ hole, par, myBox, myInRound, others }: {
  hole: number; par: number[]; myBox: number | null | undefined; myInRound: number | null;
  /** Everyone else in the round (players then guests): their key and what the round has for them on this hole. */
  others: { key: string; inRound: number | null }[];
}): { mine: number | null; others: { key: string; strokes: number }[] } {
  const mine = myBox ?? par[hole];
  return {
    mine: myInRound !== mine ? mine : null,
    others: others.filter((o) => o.inRound == null).map((o) => ({ key: o.key, strokes: par[hole] })),
  };
}

/** A score box's −/+: 1 to 15, starting from par when the box is empty. */
export function stepStrokes(current: number | null | undefined, par: number, delta: number): number {
  return Math.min(15, Math.max(1, (current ?? par) + delta));
}

/** Wolf: the Wolf for this hole (rotates in playing order) and the line under the title. */
export function wolfView(hole: number, range: [number, number], names: string[], chosen: number | null | undefined) {
  const wolf = wolfFor(hole, range, names.length);
  const who = names[wolf];
  const you = who === "You";
  return {
    wolf,
    title: `${who} ${you ? "are" : "is"} the Wolf`,
    hint: chosen === undefined ? "Pick a partner, or go it alone" : chosen === null ? `${who} ${you ? "go" : "goes"} Lone Wolf · points ×2` : `${who} + ${names[chosen]} vs the rest`,
    partners: names.map((_, i) => i).filter((i) => i !== wolf),
  };
}

/** Tapping a choice: the same one again clears it (undefined = nothing picked). */
export const toggleChoice = <T,>(chosen: T | undefined, value: T): T | undefined => chosen === value ? undefined : value;

/** A hole's picks after a tap on Wolf partner / Lone Wolf (null). */
export const withWolfPick = (input: HoleInput, value: number | null): HoleInput => ({ ...input, wolfPartner: toggleChoice(input.wolfPartner, value) });

/** A hole's picks after Double bet (tap again to undo). */
export const withDouble = (input: HoleInput): HoleInput => ({ ...input, doubled: !input.doubled });

/** A hole's picks after a side game's winner tap (greenie null = carry over); the same one again clears it. */
export function withSidePick(input: HoleInput, kind: "greenie" | "longestDrive" | "closestPin", winner: number | null): HoleInput {
  const next: HoleInput = { ...input, [kind]: toggleChoice(input[kind] as number | null | undefined, winner) };
  if (next[kind] === undefined) delete next[kind];
  return next;
}

/** Daytona: choosing who's in the middle splits the other four into the left and right pairs; tapping it again clears. */
export function withDaytonaMiddle(input: HoleInput, players: number, middle: number): HoleInput {
  if (input.daytona?.middle === middle) return { ...input, daytona: undefined };
  const rest = Array.from({ length: players }, (_, i) => i).filter((i) => i !== middle);
  return { ...input, daytona: { middle, left: [rest[0], rest[1]], right: [rest[2], rest[3]] } };
}

/** Daytona: tapping someone puts them in the left pair (the older of the two moves right). */
export function withDaytonaLeft(input: HoleInput, players: number, who: number): HoleInput {
  const spot = input.daytona;
  if (!spot) return input;
  const sides = Array.from({ length: players }, (_, i) => i).filter((i) => i !== spot.middle);
  const left: number[] = spot.left.includes(who) ? [...spot.left] : [spot.left[1], who];
  const right = sides.filter((j) => !left.includes(j));
  return { ...input, daytona: { middle: spot.middle, left: [left[0], left[1]], right: [right[0], right[1]] } };
}

/** The scorekeeper's own card as it's saved (Submit & Save): untouched holes count as par; stats (and penalty taps) only when tracked. */
export function submitCard({ par, holes, strokes, putts, fairways, greens, penalties, stats }: {
  par: number[]; holes: HolesChoice; strokes: (number | null)[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[];
  penalties?: (HolePenalties | null)[]; stats: boolean;
}): ScoredCard {
  const [start, end] = holeRange(holes);
  return {
    strokes: par.map((p, i) => i >= start && i < end ? strokes[i] ?? p : p),
    putts: par.map((_, i) => stats ? putts[i] ?? null : null),
    fairways: par.map((_, i) => stats ? fairways[i] ?? null : null),
    greens: par.map((_, i) => stats ? greens[i] ?? null : null),
    ...(stats && penalties ? { penalties: par.map((_, i) => penalties[i] ?? { fairway: false, green: false }) } : {}),
  };
}

/** The Putts row's choices (website): 0, 1, 2, 3 and 4+ (saved as 4). */
export const PUTT_CHOICES = [0, 1, 2, 3, 4] as const;
export const puttLabel = (value: number) => value >= 4 ? "4+" : String(value);

/** "+2", "E", "−1" for a to-par number (website formatToPar). */
export const toParText = (value: number) => value === 0 ? "E" : value > 0 ? `+${value}` : String(value);

/** Thru and To Par for the scorekeeper's own card: holes played that have a score, and the total against par. */
export function thruAndToPar(strokes: (number | null)[], par: number[], range: [number, number]): { thru: number; toPar: number | null } {
  let thru = 0, toPar = 0;
  for (let h = range[0]; h < range[1]; h++) if (strokes[h] != null) { thru++; toPar += strokes[h]! - par[h]; }
  return { thru, toPar: thru ? toPar : null };
}

/** Next hole's label: "Next hole", or "Scorecard" on the last hole played. */
export const nextHoleLabel = (hole: number, range: [number, number]) => hole >= range[1] - 1 ? "Scorecard" : "Next hole";

/** The par a hole cycles to when tapped on a course added by hand: 3 → 4 → 5 → 6 → 3. */
export const nextPar = (par: number) => par >= 6 ? 3 : par + 1;

/**
 * Is a hole's own card done (website GolfTripScoring holeFilled, Play): strokes always count (untouched = par); with
 * Track stats on, putts and green are needed, and fairway too except on par 3s.
 */
export function holeStatsDone({ hole, par, putts, fairways, greens, stats }: {
  hole: number; par: number[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; stats: boolean;
}): boolean {
  if (!stats) return true;
  return putts[hole] != null && greens[hole] != null && (par[hole] === 3 || fairways[hole] != null);
}

/** Submit & Save lights up once every hole played is done (see holeStatsDone). */
export function cardDone(args: { range: [number, number]; par: number[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; stats: boolean }): boolean {
  for (let hole = args.range[0]; hole < args.range[1]; hole++) if (!holeStatsDone({ ...args, hole })) return false;
  return true;
}
