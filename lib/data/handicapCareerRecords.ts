import type { CareerHoleRecord } from "./careerStats";
import { getPlayerProfileBySlug } from "./players";

export interface PersonalRoundRow { id: string; player_slug: string; date_played: string; course_id: string }
export interface PersonalHoleRow { round_id: string; hole: number; par: number; yards: number; score: number; putts: number; fir: string; gir: boolean }

export function buildHandicapCareerRecords(rounds: PersonalRoundRow[], holes: PersonalHoleRow[], courses: { id: string; name: string }[]): CareerHoleRecord[] {
  const courseNames = new Map(courses.map((course) => [course.id, course.name]));
  const byRound = new Map<string, PersonalHoleRow[]>();
  for (const hole of holes) { const list = byRound.get(hole.round_id) ?? []; list.push(hole); byRound.set(hole.round_id, list); }
  return [...rounds].sort((a, b) => a.date_played.localeCompare(b.date_played) || a.id.localeCompare(b.id)).flatMap((round, index) => {
    const scores = byRound.get(round.id) ?? [];
    // A submission is written in two steps. Never expose a half-saved round.
    if (scores.length !== 18 || new Set(scores.map((hole) => hole.hole)).size !== 18 || scores.some((hole) => hole.hole < 1 || hole.hole > 18 || hole.score <= 0)) return [];
    return scores.map((hole): CareerHoleRecord => ({
      source: "other", roundId: `handicap:${round.id}`, datePlayed: round.date_played,
      year: Number(round.date_played.slice(0, 4)), player: getPlayerProfileBySlug(round.player_slug)?.id ?? round.player_slug,
      round: index + 1, roundHoles: 18, course: courseNames.get(round.course_id) ?? "Unknown course", format: "Stroke Play",
      hole: hole.hole, par: hole.par, yards: hole.yards, score: hole.score, putts: hole.putts,
      fairwayInRegulation: hole.par === 3 || hole.fir === "X" ? null : hole.fir === "1",
      greenInRegulation: hole.gir, penalties: null,
    }));
  });
}
