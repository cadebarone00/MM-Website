import type { CareerHoleRecord, CareerTeamHoleRecord } from "@/lib/data/careerStats";
import type { Tournament } from "@/lib/data/types";
import type { LiveTournamentSnapshot } from "@/lib/live/types";
import type { FutureFormat, Roster } from "./teamWinnerFuture";

/**
 * The tournament setup every future prices against. Anything Tiger hasn't
 * set for the season yet — the number of rounds, a round's format or
 * course, the rosters — defaults to the most recent past tournament in the
 * Career Archive, so odds exist before the season is configured. Every
 * default is listed in `assumptions` so the public cards can say so.
 */

export type SetupHole = { number: number; par: number; yards: number };
export type SetupCourse = { key: string; name: string; holes: SetupHole[] };
export type SetupRound = { round: number; format: FutureFormat; course: SetupCourse; formatAssumed: boolean; courseAssumed: boolean; matchupsLocked: boolean };

export type TournamentSetup = {
  roster: Roster;
  rounds: SetupRound[];
  blockers: string[];
  assumptions: string[];
  referenceYear: number | null;
};

type ReferenceRound = { format: FutureFormat; course: SetupCourse };
export type ReferenceSetup = { year: number; rounds: Map<number, ReferenceRound>; roster: Roster | null };

function holesFrom(rows: { hole: number; par: number; yards: number }[]): SetupHole[] {
  const byHole = new Map<number, SetupHole>();
  for (const row of rows) if (!byHole.has(row.hole) && row.par > 0) byHole.set(row.hole, { number: row.hole, par: row.par, yards: row.yards });
  return [...byHole.values()].sort((a, b) => a.number - b.number);
}

/** Last year's rounds (format, course, hole setup) and roster, read from the Career Archive. */
export function referenceSetup(
  seasonYear: number,
  records: CareerHoleRecord[],
  teamRecords: CareerTeamHoleRecord[],
  tournaments: Pick<Tournament, "year" | "roster">[],
): ReferenceSetup | null {
  const individual = records.filter((row) => row.year < seasonYear && row.roundHoles === 18 && (row.format === "Singles" || row.format === "Fourball"));
  const shared = teamRecords.filter((row) => row.year < seasonYear && (row.format === "Alternate Shot" || row.format === "Foursome"));
  const year = Math.max(...individual.map((row) => row.year), ...shared.map((row) => row.year));
  if (!Number.isFinite(year)) return null;

  const rounds = new Map<number, ReferenceRound>();
  const add = (round: number, format: FutureFormat, rows: { course: string; hole: number; par: number; yards: number }[]) => {
    const course = rows[0].course;
    const holes = holesFrom(rows.filter((row) => row.course === course));
    if (holes.length === 18) rounds.set(round, { format, course: { key: `archive:${year}:${course}`, name: course, holes } });
  };
  for (const round of new Set(individual.filter((row) => row.year === year).map((row) => row.round))) {
    const rows = individual.filter((row) => row.year === year && row.round === round);
    const firstPlayer = rows[0].player;
    add(round, rows[0].format as FutureFormat, rows.filter((row) => row.player === firstPlayer));
  }
  for (const round of new Set(shared.filter((row) => row.year === year).map((row) => row.round))) {
    const rows = shared.filter((row) => row.year === year && row.round === round);
    const firstTeam = rows[0].teamId;
    add(round, "Foursome", rows.filter((row) => row.teamId === firstTeam));
  }
  const roster = tournaments.find((tournament) => tournament.year === year)?.roster ?? null;
  return { year, rounds, roster: roster ? { maroon: [...roster.maroon].sort(), white: [...roster.white].sort() } : null };
}

/**
 * Whether a course Tiger picked can actually be priced: a real name (not a
 * "To Be Determined" placeholder) and 18 holes with a real par and yardage.
 * Anything else counts as not set yet, so the round keeps last year's course.
 */
export function isUsableCourse(course: { name: string; holes: { par: number | null; yards: number | null }[] } | undefined): boolean {
  if (!course || /to be determined|\btbd\b/i.test(course.name)) return false;
  return course.holes.length === 18 && course.holes.every((hole) => (hole.par ?? 0) >= 3 && (hole.par ?? 0) <= 6 && (hole.yards ?? 0) > 0);
}

/** "1–3, 5" for [1, 2, 3, 5]. */
export function roundList(rounds: number[]): string {
  const parts: string[] = [];
  for (let index = 0; index < rounds.length; index += 1) {
    let end = index;
    while (end + 1 < rounds.length && rounds[end + 1] === rounds[end] + 1) end += 1;
    parts.push(end > index ? `${rounds[index]}–${rounds[end]}` : String(rounds[index]));
    index = end;
  }
  return parts.join(", ");
}

/**
 * Merges what Tiger has set for the season with the reference defaults.
 * Pure: the caller loads the season rows and the live snapshot.
 */
export function buildTournamentSetup({
  roundCount,
  roundRows,
  snapshot,
  reference,
}: {
  roundCount: number | null;
  roundRows: { round: number; format: string | null; matchups_locked: boolean }[];
  snapshot: Pick<LiveTournamentSnapshot, "players" | "courses" | "roundCourses">;
  reference: ReferenceSetup | null;
}): TournamentSetup {
  const blockers: string[] = [];
  const assumptions: string[] = [];

  const liveRoster: Roster = { maroon: [], white: [] };
  for (const [player, { team }] of Object.entries(snapshot.players)) liveRoster[team].push(player);
  liveRoster.maroon.sort();
  liveRoster.white.sort();
  let roster = liveRoster;
  if (!liveRoster.maroon.length || !liveRoster.white.length) {
    if (reference?.roster) {
      roster = reference.roster;
      assumptions.push(`Using the ${reference.year} rosters until this year's teams are set.`);
    } else {
      blockers.push("Both team rosters need to be set.");
    }
  }

  const count = roundCount ?? reference?.rounds.size ?? null;
  if (!count) blockers.push("Tiger hasn't set the number of rounds yet.");
  if (!roundCount && count) assumptions.push(`Using ${reference!.year}'s ${count}-round schedule until the number of rounds is set.`);

  const rounds: SetupRound[] = [];
  const formatRounds: number[] = [];
  const courseRounds: number[] = [];
  for (let number = 1; number <= (count ?? 0); number += 1) {
    const row = roundRows.find((candidate) => candidate.round === number);
    const fallback = reference?.rounds.get(number);
    const setFormat = row?.format === "Singles" || row?.format === "Fourball" || row?.format === "Foursome" ? row.format : null;
    const format = setFormat ?? fallback?.format ?? null;
    const pickedCourse = snapshot.courses[snapshot.roundCourses[number]];
    const liveCourse = isUsableCourse(pickedCourse) ? pickedCourse : undefined;
    const course: SetupCourse | null = liveCourse
      ? { key: liveCourse.id, name: liveCourse.name, holes: liveCourse.holes.map((hole) => ({ number: hole.number, par: hole.par, yards: hole.yards })) }
      : fallback?.course ?? null;
    if (!format) { blockers.push(`Round ${number} needs a format.`); continue; }
    if (!course) { blockers.push(`Round ${number} needs a course.`); continue; }
    const formatAssumed = !setFormat;
    const courseAssumed = !liveCourse;
    if (formatAssumed) formatRounds.push(number);
    if (courseAssumed) courseRounds.push(number);
    rounds.push({ round: number, format, course, formatAssumed, courseAssumed, matchupsLocked: Boolean(row?.matchups_locked) });
  }
  if (reference) {
    const sentence = (list: number[], what: string) =>
      `Round${list.length > 1 ? "s" : ""} ${roundList(list)} use${list.length > 1 ? "" : "s"} ${reference.year}'s ${what} until Tiger sets ${list.length > 1 || what.includes(" and ") ? "them" : "it"}.`;
    if (formatRounds.length && formatRounds.join() === courseRounds.join()) {
      assumptions.push(sentence(formatRounds, "format and course"));
    } else {
      if (formatRounds.length) assumptions.push(sentence(formatRounds, "format"));
      if (courseRounds.length) assumptions.push(sentence(courseRounds, "course"));
    }
  }
  return { roster, rounds, blockers, assumptions, referenceYear: reference?.year ?? null };
}
