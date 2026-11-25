/**
 * Leagues on the phone (pure, unit-tested; project_specs.md "Expo app Step 5"). The league rules themselves live in
 * the shared lib/platform/leagues.ts; these are the small screen helpers the website keeps inline.
 */
import type { LeagueChange, LeagueCourse } from "@/lib/platform/leagues";
import type { ScoringCourse } from "@/lib/platform/personalRound";

/** A handicap index from what was typed: -10 to 54, else null (blank = no handicap). */
export function handicapValue(text: string): number | null {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null;
}
/** Blank, or a handicap that fits. */
export const handicapOk = (text: string) => text.trim() === "" || handicapValue(text) !== null;

/** "2026-11-12" → "Thu, Nov 12". */
export function dayLabel(date: string): string {
  const day = new Date(`${date}T12:00:00`);
  return Number.isNaN(day.getTime()) ? date : day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "T2" when more than one shares the place, as on golf leaderboards; "–" before anyone has a score. */
export function placeLabel(position: number | null, all: (number | null)[]): string {
  if (position == null) return "–";
  return all.filter((p) => p === position).length > 1 ? `T${position}` : String(position);
}

/** Changes to the same thing (one player's hole, one group's game) replace each other while they're sending. */
export function changeKey(change: LeagueChange): string {
  if (change.action === "strokes") return `strokes:${change.player}:${change.hole}`;
  if (change.action === "game" || change.action === "submit") return `${change.action}:${change.group}`;
  return change.action;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
export const playersText = (count: number) => `${count} ${count === 1 ? "player" : "players"}`;

/** A group's line on Tee Times: "Card in", "Not started", "Thru 7", "Finished". */
export function groupProgress(submitted: boolean, thru: number): string {
  if (submitted) return "Card in";
  if (thru === 0) return "Not started";
  return thru >= 18 ? "Finished" : `Thru ${thru}`;
}

/** A searched course + the picked tee, as a league stores it (website LeagueCreate). Null = not an 18-hole course. */
export function leagueCourseFrom(course: ScoringCourse, tee: number): LeagueCourse | null {
  if (course.par.length !== 18) return null;
  const strokeIndex = course.strokeIndex && course.strokeIndex.every((s): s is number => typeof s === "number") ? course.strokeIndex : null;
  const picked = course.tees[tee] ?? null;
  return { ref: course.ref, name: course.name, place: course.place || null, par: course.par, strokeIndex, tee: picked && { name: picked.name, rating: picked.rating, slope: picked.slope } };
}
