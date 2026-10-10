import type { GolfCourse } from "./golfGps/domain";
import { buildPlayerRound, holesFromCard, playerRoundId, type PlayerRound, type PlayerRoundTee, type ScoredCard } from "./playerRounds.ts";
import { gameDef, type GameConfig } from "./roundGames.ts";

/**
 * Play a round (personal rounds): the plain rules behind /rounds/new, kept here so they're easy to test.
 * A personal round is one player, stroke play, saved to their account with source "personal".
 */

export type HolesChoice = "18" | "front" | "back";

/** What the round screens need from a course: pars for holes 1–18 and the tees with rating + slope. */
export interface ScoringCourse {
  ref: string;
  name: string;
  place: string;
  par: number[];
  /** Hardest (1) to easiest (18) per hole, for net games; null when the course doesn't say. */
  strokeIndex?: (number | null)[];
  tees: PlayerRoundTee[];
  /** No scorecard on file: pars were set by the player as they played (start at 4). */
  custom?: boolean;
}

/** A scorecard to build while playing: 18 holes, par 4 unless pars were saved from an earlier round here. */
export function customCourse(ref: string, name: string, place: string, par?: number[]): ScoringCourse {
  const known = par?.length === 18 && par.every((p) => Number.isInteger(p) && p >= 3 && p <= 6) ? par : null;
  return { ref, name, place, par: known ?? Array.from({ length: 18 }, () => 4), tees: [], custom: true };
}

/** Someone invited to the round (a Maroon account). */
export interface RoundPlayer { name: string; profileId: string | null; handicap: number | null }

export interface PersonalRoundSetup {
  course: ScoringCourse;
  tee: PlayerRoundTee | null;
  holes: HolesChoice;
  stats: boolean;
  /** Off = practice round: saved, but never counts toward the handicap. */
  countForHandicap: boolean;
  /** YYYY-MM-DD */
  datePlayed: string;
  /** Players invited at setup (up to 4); empty / missing = just me (a round kept only on this phone). */
  players?: RoundPlayer[];
  /** My handicap index, for net games. */
  myHandicap?: number | null;
  /** The group's game, if any. */
  game?: GameConfig | null;
}

/** Hole indexes (0-based, end exclusive) for the holes choice. */
export function holeRange(holes: HolesChoice): [number, number] {
  return holes === "front" ? [0, 9] : holes === "back" ? [9, 18] : [0, 18];
}

/** Pars and tees from a course. Null when the course doesn't have 18 holes with pars (it can't be scored here yet). */
export function scoringCourse(ref: string, course: GolfCourse): ScoringCourse | null {
  const holes = [...course.holes].sort((a, b) => a.number - b.number);
  if (holes.length !== 18 || holes.some((hole) => !Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6)) return null;
  const tees = (course.teeSets ?? []).map((tee) => {
    // Men's rating first (most common scorecard row), else whatever the tee has.
    const rating = tee.ratings?.find((r) => r.gender === "men") ?? tee.ratings?.find((r) => r.gender === "unspecified") ?? tee.ratings?.[0];
    return { name: tee.name, rating: rating?.courseRating ?? null, slope: rating?.slopeRating ?? null };
  });
  const place = [course.address?.city, course.address?.state].filter(Boolean).join(", ");
  return { ref, name: course.name, place, par: holes.map((hole) => hole.par), strokeIndex: holes.map((hole) => hole.strokeIndex ?? null), tees };
}

/** The saved round for a finished card. Same handicap rules as trip rounds; a practice round never counts. */
export function personalRound(profileId: string, setup: PersonalRoundSetup, card: ScoredCard, startedAt: string): PlayerRound {
  const [start, end] = holeRange(setup.holes);
  const slice = <T,>(values: T[]) => values.slice(start, end);
  const holes = holesFromCard({
    strokes: slice(card.strokes), putts: setup.stats ? slice(card.putts) : slice(card.putts).map(() => null),
    fairways: setup.stats ? slice(card.fairways) : slice(card.fairways).map(() => null),
    greens: setup.stats ? slice(card.greens) : slice(card.greens).map(() => null),
    ...(setup.stats && card.penalties ? { penalties: slice(card.penalties) } : {}),
  }, slice(setup.course.par)).map((hole, i) => ({ ...hole, number: start + i + 1 }));
  const round = buildPlayerRound({
    id: playerRoundId("personal", profileId, startedAt),
    profileId, source: "personal", datePlayed: setup.datePlayed,
    course: { ref: setup.course.ref, name: setup.course.name, place: setup.course.place },
    tee: setup.tee, holesPlayed: end - start === 9 ? 9 : 18, format: setup.game ? gameDef(setup.game.id).name : "Stroke Play", holes, enteredBy: "player",
  });
  return setup.countForHandicap ? round : { ...round, countsForHandicap: false, differential: null, notCountedReason: "Practice round" };
}

