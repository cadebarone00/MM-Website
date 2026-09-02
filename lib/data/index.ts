import { pinehurst2024 } from "./2024-pinehurst";
import { danzante2025 } from "./2025-danzante";
import { palmSprings2026 } from "./2026-palm-springs";
import { upcoming2027 } from "./2027-upcoming";
import { venue2024 } from "./2024-venue";
import { venue2025 } from "./2025-venue";
import { venue2026 } from "./2026-venue";
import { venue2027 } from "./2027-venue";
import type { Team, Tournament, UpcomingTournament, PlayerScorecard, RoundScorecard, VenueSchedule } from "./types";

export type { Team, Tournament, UpcomingTournament, RealMatch, IndividualStanding, PlayerScorecard, RoundScorecard, HoleStat, CourseHole, VenueCourse, VenueSession, VenueSchedule, NextTournamentOverride } from "./types";

export const pastTournaments: Tournament[] = [pinehurst2024, danzante2025, palmSprings2026];
export const nextTournament: UpcomingTournament = upcoming2027;
export const nextVenue: VenueSchedule = venue2027;

export const pastVenues: Record<string, VenueSchedule> = {
  "2024-pinehurst": venue2024,
  "2025-danzante": venue2025,
  "2026-palm-springs": venue2026,
};

export function getVenueBySlug(slug: string): VenueSchedule | undefined {
  if (slug === nextTournament.slug) return nextVenue;
  return pastVenues[slug];
}

export function champion(t: Tournament): Team {
  return t.maroonPts >= t.whitePts ? "maroon" : "white";
}

// The team that entered `t` as defending champion: the winner of the
// tournament immediately before it in `pastTournaments` order. If `t` isn't
// in `pastTournaments` at all (the live/upcoming tournament), the defender
// is the winner of the most recent past tournament. If `t` is the first
// tournament on record, there's no defender.
export function defendingChampion(t: Tournament): Team | null {
  const index = pastTournaments.findIndex((p) => p.slug === t.slug);
  if (index === -1) return champion(latestCompleted);
  if (index === 0) return null;
  return champion(pastTournaments[index - 1]);
}

export function fmtPt(v: number): string {
  return v % 1 === 0.5 ? Math.floor(v) + "½" : String(v);
}

export type TournamentStatus = "completed" | "live" | "upcoming";

export function getNextTournamentStatus(now: Date = new Date()): TournamentStatus {
  const start = new Date(nextTournament.liveAt);
  const end = new Date(nextTournament.endDate + "T23:59:59");
  if (now >= start && now <= end) return "live";
  if (now < start) return "upcoming";
  return "completed";
}

export function isLiveNow(now: Date = new Date()): boolean {
  return getNextTournamentStatus(now) === "live";
}

// The calendar date the public Leaderboard switches from defaulting to the
// latest *completed* tournament over to `nextTournament` — independent of
// `isLiveNow()`/`liveAt`, which track the tournament's actual first tee
// time. The switchover happens at the start of the new year so visitors
// land on the upcoming season ahead of the first round, instead of still
// defaulting to last year's results (or a dead-end empty page for a season
// that hasn't started) right up until play begins. Tied to
// `nextTournament.year` so this doesn't need a manual date update for each
// new season.
export function isPastLeaderboardSwitchover(now: Date = new Date()): boolean {
  // A date-only string ("2027-01-01") parses as UTC midnight, while a
  // datetime string with no offset parses as local time — comparing the two
  // directly makes the boundary shift by the server's UTC offset. Adding an
  // explicit local midnight keeps both sides of the comparison in the same
  // (local) time.
  return now >= new Date(`${nextTournament.year}-01-01T00:00:00`);
}

export const latestCompleted: Tournament = pastTournaments[pastTournaments.length - 1];

export function getTournament(slug: string): Tournament | undefined {
  return pastTournaments.find((t) => t.slug === slug);
}

export function individualTitleCount(playerId: string): number {
  return pastTournaments.filter((t) => t.individualChampion === playerId).length;
}

// The individual title holder defending entering `t`: the individual
// champion of the tournament immediately before it in `pastTournaments`
// order. If `t` isn't in `pastTournaments` at all (the live/upcoming
// tournament), the defender is the champion of the most recent past
// tournament. If `t` is the first tournament on record, there's no defender.
export function defendingIndividualChampion(t: Tournament): string | null {
  const index = pastTournaments.findIndex((p) => p.slug === t.slug);
  if (index === -1) return latestCompleted.individualChampion ?? null;
  if (index === 0) return null;
  return pastTournaments[index - 1].individualChampion ?? null;
}

export function playersOf(t: Tournament): { name: string; team: Team }[] {
  return [...t.roster.maroon.map((name) => ({ name, team: "maroon" as Team })), ...t.roster.white.map((name) => ({ name, team: "white" as Team }))];
}

export function matchesByDay(t: Tournament): { day: number; matches: Tournament["matches"] }[] {
  const days = [...new Set(t.matches.map((m) => m.day))].sort((a, b) => a - b);
  return days.map((day) => ({ day, matches: t.matches.filter((m) => m.day === day) }));
}

export function getPlayerScorecard(t: Tournament, player: string): PlayerScorecard | undefined {
  return t.scorecards?.find((s) => s.player.toLowerCase() === player.toLowerCase());
}

export function getRoundScorecard(t: Tournament, player: string, round: number): RoundScorecard | undefined {
  return getPlayerScorecard(t, player)?.rounds.find((r) => r.round === round);
}

export function getHoleStat(t: Tournament, player: string, round: number, hole: number) {
  return getRoundScorecard(t, player, round)?.holes.find((h) => h.hole === hole);
}

export type HoleMarker = "eagle" | "birdie" | "par" | "bogey" | "double-or-worse";

export function holeMarker(diff: number): HoleMarker {
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "double-or-worse";
}

// Short, informal course names for spots where a round needs to be labeled
// by what was played rather than by round number (e.g. the per-round mini
// charts in the Statistics section) — the full course field stays as the
// record of truth (shown in the round picker), this is display-only.
const SHORT_COURSE_NAMES: Record<string, string> = {
  Cove: "IW Cove",
  Classic: "IW Classic",
  Tournament: "Tourney",
};

export function shortCourseName(course: string): string {
  return SHORT_COURSE_NAMES[course] ?? course;
}

export function daySummary(matches: Tournament["matches"]) {
  const maroonPts = matches.reduce((sum, m) => sum + m.maroonPts, 0);
  const whitePts = matches.reduce((sum, m) => sum + m.whitePts, 0);
  const sessions = [...new Set(matches.map((m) => m.session))];
  const bySession = sessions.map((session) => ({
    session,
    formats: [...new Set(matches.filter((m) => m.session === session).map((m) => m.format))],
    count: matches.filter((m) => m.session === session).length,
  }));
  return { maroonPts, whitePts, bySession };
}
