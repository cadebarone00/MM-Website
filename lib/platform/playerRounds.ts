import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "@/lib/handicap/whs";
import type { RoundsVisibility } from "./playerRoundsPrivacy";

/**
 * Player rounds: one saved round per golfer profile (profiles.id) per round played. The trip, its leaderboard, Profile → Rounds and the
 * handicap all read this same record — never a copy. See project_specs.md, "Player rounds — one saved round per account".
 * Pure functions, safe anywhere; Step 1 keeps the records in a dev store, Step 2 in the database.
 */

/** Where a shot finished (the Scoring sheet's arrows). "center" = fairway / green hit. */
export type ShotResult = "up" | "left" | "center" | "right" | "down";
export type RoundSource = "trip" | "tournament" | "personal" | "history";
/** Penalty taps on the Scoring sheet (fairway / green). */
export interface HolePenalties { fairway: boolean; green: boolean }
/** Organizer change log (Player & Attest add-on, decisions 9–10). */
export type EditableField = "strokes" | "putts" | "fairway" | "green";
export interface ScoreEdit { hole: number; field: EditableField; from: number | ShotResult | null; to: number | ShotResult | null; byProfileId: string; at: string; reason: string; kind: "override" | "pushThrough" }

export interface PlayerRoundHole { number: number; par: number; strokes: number; putts: number | null; fairway: ShotResult | null; green: ShotResult | null; penalties?: HolePenalties }
/** Snapshot at submit time; rating / slope are null when the course data has none. */
export interface PlayerRoundTee { name: string; rating: number | null; slope: number | null }

export interface PlayerRound {
  id: string;
  profileId: string;
  source: RoundSource;
  tripId?: string;
  tripRoundId?: string;
  historyTripId?: string;
  /** Where it came from, as words (e.g. the trip's name) — kept even if the trip is deleted later. */
  sourceLabel?: string;
  datePlayed: string;
  /** `ref` = the course API id (null for a typed course); name / place = the label saved at play time. */
  course: { ref: string | null; name: string; place: string };
  tee: PlayerRoundTee | null;
  holesPlayed: 9 | 18;
  format: string;
  /** Empty for a total-only round (History). */
  holes: PlayerRoundHole[];
  total: number;
  countsForHandicap: boolean;
  notCountedReason: string | null;
  differential: number | null;
  enteredBy: "player" | "organizer";
  status: "submitted";
  /** The group this round was played in (Player & Attest); absent for History and older rounds. */
  groupId?: string;
  /** Personal rounds only: who else may see it (add-on decision 11). */
  visibility?: RoundsVisibility;
  /** Removed by the player (add-on decision 15): gone from their Rounds, Stats and handicap; the trip keeps it. */
  removedFromProfile?: boolean;
  /** Organizer overrides / push-throughs, oldest first. */
  edits?: ScoreEdit[];
}

export type PlayerRoundInput = Omit<PlayerRound, "total" | "countsForHandicap" | "notCountedReason" | "differential" | "status"> & { total?: number };

/** The Scoring sheet's card: one entry per hole, 1–18. */
export interface ScoredCard { strokes: number[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; penalties?: HolePenalties[] }

/** Deterministic ids: the same profile + round always gets the same id, so a round can only be saved once. */
export const playerRoundId = (...parts: string[]) => parts.join(":");

/** Not own ball the whole way → never counts. Four-ball / best ball is own ball and does count. */
const TEAM_FORMAT = /scramble|alternate[- ]?shot|alt[- ]?shot|foursome|shamble|greensome|chapman|pinehurst|gruesome/i;

export function handicapEligibility(round: Pick<PlayerRound, "holesPlayed" | "format" | "tee" | "holes" | "total" | "enteredBy">):
  { counts: true; differential: number } | { counts: false; reason: string } {
  if (round.enteredBy === "organizer") return { counts: false, reason: "Entered by organizer" };
  if (TEAM_FORMAT.test(round.format)) return { counts: false, reason: `${round.format} isn't an own ball format` };
  if (round.holesPlayed === 9) return { counts: false, reason: "9-hole rounds will count once 9-hole scoring is added" };
  if (round.holes.length !== round.holesPlayed) return { counts: false, reason: "Not every hole was scored" };
  const { tee } = round;
  if (!tee || tee.rating === null || tee.slope === null || tee.slope < 55 || tee.slope > 155) return { counts: false, reason: "No course rating for this tee" };
  return { counts: true, differential: calculateDifferential(round.total, tee.rating, tee.slope) };
}

export function buildPlayerRound(input: PlayerRoundInput): PlayerRound {
  for (const hole of input.holes) {
    if (!Number.isInteger(hole.strokes) || hole.strokes < 1 || hole.strokes > 20) throw new Error(`Hole ${hole.number}: strokes must be 1–20.`);
  }
  const total = input.holes.length ? input.holes.reduce((sum, hole) => sum + hole.strokes, 0) : input.total;
  if (total === undefined || !Number.isInteger(total) || total < 18 || total > 200) throw new Error("A round needs a total between 18 and 200.");
  const { total: _ignored, ...rest } = input;
  void _ignored;
  const eligibility = handicapEligibility({ ...input, total });
  return {
    ...rest, total, status: "submitted",
    countsForHandicap: eligibility.counts,
    differential: eligibility.counts ? eligibility.differential : null,
    notCountedReason: eligibility.counts ? null : eligibility.reason,
  };
}

export function holesFromCard(card: ScoredCard, par: number[]): PlayerRoundHole[] {
  return card.strokes.map((strokes, index) => ({
    number: index + 1, par: par[index], strokes, putts: card.putts[index] ?? null,
    fairway: par[index] === 3 ? null : card.fairways[index] ?? null, green: card.greens[index] ?? null,
    ...(card.penalties ? { penalties: card.penalties[index] ?? { fairway: false, green: false } } : {}),
  }));
}

export function cardFromHoles(holes: PlayerRoundHole[]): ScoredCard {
  return { strokes: holes.map((h) => h.strokes), putts: holes.map((h) => h.putts), fairways: holes.map((h) => h.fairway), greens: holes.map((h) => h.green),
    ...(holes.some((h) => h.penalties) ? { penalties: holes.map((h) => h.penalties ?? { fairway: false, green: false }) } : {}) };
}

/** Index from the most recent 20 counting rounds (newest first); low index replays them oldest first. */
export function handicapSummary(rounds: PlayerRound[]) {
  const counting = rounds.filter((round) => !round.removedFromProfile && round.countsForHandicap && round.differential !== null)
    .sort((a, b) => b.datePlayed.localeCompare(a.datePlayed) || b.id.localeCompare(a.id));
  const newestFirst = counting.map((round) => round.differential as number);
  return { index: calculateHandicapIndex(newestFirst.slice(0, 20)), lowIndex: calculateLowIndex([...newestFirst].reverse()), counting: counting.length };
}
