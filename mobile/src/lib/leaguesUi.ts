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

/** "08:30" → that time today (for the time wheel). Bad text → 8:00. */
export function timeDate(text: string): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  const day = new Date();
  day.setHours(match ? Number(match[1]) : 8, match ? Number(match[2]) : 0, 0, 0);
  return day;
}
/** A picked time as the tee sheet stores it ("08:30"). */
export const timeText = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

type DraftGroup = { time: string; hole: number; scorer: string; players: string[] };
/** Tee Times editor: move a player to group `to` (an index; groups.length = a new group), empty groups dropped and
 *  each group's scorer kept only while they're still in it (website TeeTimesEditor.move + save). */
export function movePlayer(groups: DraftGroup[], id: string, to: number, firstTime: string): DraftGroup[] {
  const next = groups.map((g) => ({ ...g, players: g.players.filter((x) => x !== id) }));
  if (to >= next.length) next.push({ time: next.at(-1)?.time ?? firstTime, hole: 1, scorer: id, players: [id] });
  else next[to] = { ...next[to], players: [...next[to].players, id] };
  return cleanGroups(next);
}
export const cleanGroups = (groups: DraftGroup[]): DraftGroup[] =>
  groups.filter((g) => g.players.length).map((g) => ({ ...g, scorer: g.players.includes(g.scorer) ? g.scorer : g.players[0] }));
