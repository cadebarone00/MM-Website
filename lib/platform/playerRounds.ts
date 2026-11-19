import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "@/lib/handicap/whs";
import type { RoundsVisibility } from "./playerRoundsPrivacy";

/**
 * Player rounds: one saved round per golfer profile (profiles.id) per round played. The trip, its leaderboard, Profile → Rounds and the
 * handicap all read this same record — never a copy. See project_specs.md, "Player rounds — one saved round per account".
 * Pure functions, safe anywhere; Step 1 keeps the records in a dev store, Step 2 in the database.
 */

/** Where a shot finished (the Scoring sheet's arrows). "center" = fairway / green hit. */
export type ShotResult = "up" | "left" | "center" | "right" | "down";
/** legacy = imported from the original Maroon system (supabase/legacy_round_import.sql). */
/** Where a round came from. "tourney" = a code tournament (Tourneys), "league" = a league (supabase/rounds_everywhere.sql). */
export type RoundSource = "trip" | "tournament" | "personal" | "history" | "legacy" | "tourney" | "league";
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
  /** Tournament rounds: the edition, its round and the golfer's tournament player (supabase/player_rounds.sql). */
  editionId?: string;
  editionRoundId?: string;
  tournamentPlayerId?: string;
  /** Personal ("just playing") rounds: the stable id made when the golfer started it. */
  personalRoundId?: string;
  /** The official card this was published from and its revision (2+ = an approved correction). */
  scorecardSubmissionId?: string;
  submissionRevision?: number;
  /** Imported rounds only: which old record it came from (owner view only — it names the old player slot). */
  provenance?: RoundProvenance;
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

export interface RoundProvenance { system: string; seasonYear?: number; round?: number; tournamentSlug?: string }

export type PlayerRoundInput = Omit<PlayerRound, "total" | "countsForHandicap" | "notCountedReason" | "differential" | "status"> & { total?: number };

/** The Scoring sheet's card: one entry per hole, 1–18. */
export interface ScoredCard { strokes: number[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; penalties?: HolePenalties[] }

/** Deterministic ids: the same profile + round always gets the same id, so a round can only be saved once. */
export const playerRoundId = (...parts: string[]) => parts.join(":");

/**
 * The database's source keys (supabase/player_rounds.sql, player_rounds_source_identity): one real round = one key,
 * unique per profile. Never built from course + date, so the same course twice in a day is two rounds.
 */
export const tripRoundSourceKey = (tripId: string, tripRoundId: string) => `trip:${tripId}:${tripRoundId}`;
export const tournamentRoundSourceKey = (editionId: string, editionRoundId: string) => `tournament:${editionId}:${editionRoundId}`;
export const personalRoundSourceKey = (personalRoundId: string) => `personal:${personalRoundId}`;

/** Not own ball the whole way → never counts. Four-ball / best ball is own ball and does count. */
const TEAM_FORMAT = /scramble|alternate[- ]?shot|alt[- ]?shot|foursome|shamble|greensome|chapman|pinehurst|gruesome/i;

export function handicapEligibility(round: Pick<PlayerRound, "holesPlayed" | "format" | "tee" | "holes" | "total" | "enteredBy">):
  { counts: true; differential: number } | { counts: false; reason: string } {
  if (round.enteredBy === "organizer") return { counts: false, reason: "Entered by organizer" };
  if (TEAM_FORMAT.test(round.format)) return { counts: false, reason: `${round.format} isn't an own ball format` };
  // A 9 on its own isn't a handicap round: it counts when combined with another 9 (nineHolePairs).
  if (round.holesPlayed === 9) return { counts: false, reason: "9 holes: counts when combined with another 9" };
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

type HandicapRound = Pick<PlayerRound, "id" | "datePlayed" | "holesPlayed" | "format" | "tee" | "holes" | "total" | "enteredBy" | "countsForHandicap" | "differential">
  & { removedFromProfile?: boolean };

/** A 9-hole round that will count once it's combined with another: the player's own ball, all 9 holes, a rated tee. */
export function nineHoleQualifies(round: HandicapRound): boolean {
  if (round.holesPlayed !== 9 || round.removedFromProfile || round.enteredBy === "organizer" || TEAM_FORMAT.test(round.format) || round.holes.length !== 9) return false;
  const { tee } = round;
  return Boolean(tee && tee.rating !== null && tee.slope !== null && tee.slope >= 55 && tee.slope <= 155);
}
/** A 9-hole course rating: courses list an 18-hole rating, so half of it (a rating under 50 is already a 9-hole one). */
const nineRating = (rating: number) => rating < 50 ? rating : rating / 2;

/**
 * 9-hole rounds count in pairs (owner decision 2026-11-13): qualifying 9s are combined oldest first (1st + 2nd, 3rd + 4th …)
 * into one 18-hole differential = (both scores − both 9-hole ratings) × 113 ÷ their average slope, dated the second 9.
 * The newest unpaired 9 waits for the next one. Map: each 9-hole round's id → its pair, or "waiting".
 */
export function nineHolePairs(rounds: HandicapRound[]): Map<string, { differential: number; with: string; datePlayed: string } | "waiting"> {
  const nines = rounds.filter(nineHoleQualifies).sort((a, b) => a.datePlayed.localeCompare(b.datePlayed) || a.id.localeCompare(b.id));
  const pairs = new Map<string, { differential: number; with: string; datePlayed: string } | "waiting">();
  for (let i = 0; i < nines.length; i += 2) {
    const first = nines[i], second = nines[i + 1];
    if (!second) { pairs.set(first.id, "waiting"); break; }
    const rating = nineRating(first.tee!.rating!) + nineRating(second.tee!.rating!);
    const slope = Math.round((first.tee!.slope! + second.tee!.slope!) / 2);
    const differential = calculateDifferential(first.total + second.total, rating, slope);
    pairs.set(first.id, { differential, with: second.id, datePlayed: second.datePlayed });
    pairs.set(second.id, { differential, with: first.id, datePlayed: second.datePlayed });
  }
  return pairs;
}

/** Every differential that counts, newest first: 18-hole rounds that count, and each pair of 9s as one. */
export function countingDifferentials(rounds: HandicapRound[]): number[] {
  const eighteens = rounds.filter((round) => !round.removedFromProfile && round.countsForHandicap && round.differential !== null)
    .map((round) => ({ date: round.datePlayed, id: round.id, differential: round.differential as number }));
  const combined: { date: string; id: string; differential: number }[] = [];
  for (const [id, pair] of nineHolePairs(rounds)) if (pair !== "waiting" && id < pair.with) combined.push({ date: pair.datePlayed, id, differential: pair.differential });
  return [...eighteens, ...combined].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).map((d) => d.differential);
}

/** Index from the most recent 20 counting differentials (newest first; two 9s make one); low index replays them oldest first. */
export function handicapSummary(rounds: PlayerRound[]) {
  const newestFirst = countingDifferentials(rounds);
  return { index: calculateHandicapIndex(newestFirst.slice(0, 20)), lowIndex: calculateLowIndex([...newestFirst].reverse()), counting: newestFirst.length };
}
