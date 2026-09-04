// lib/broadcast/liveSnapshot.ts
//
// Server-only. Builds the same LiveTournamentSnapshot shape
// lib/live/scoring.ts and lib/live/orchestration.ts already operate on
// (see lib/live/types.ts), from the real live_* Supabase tables for one
// season — this is the piece that was still missing: everything built so
// far reads/writes one round or one match box at a time, nothing yet
// assembles the whole tournament's live state in one shot. Broadcast scenes
// need the whole thing (a leaderboard is every player, every round).
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { scoreKey, type LiveCourse, type LiveHole, type LiveHoleScore, type LiveMatchBox, type LiveTournamentSnapshot, type MatchFormat, type MatchState, type Team } from "@/lib/live/types";

interface RosterRow {
  player_slug: string;
  team: Team;
}
interface CourseRow {
  id: string;
  name: string;
  holes: LiveHole[];
  rating: number | null;
  slope: number | null;
}
interface RoundStateRow {
  round: number;
  course_id: string | null;
}
interface MatchBoxRow {
  id: string;
  round: number;
  box_number: number;
  format: string;
  tee_time: string;
  maroon_players: string[];
  white_players: string[];
  state: string;
  started: boolean;
}
interface HoleScoreRow {
  player_slug: string;
  round: number;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  host_edited: boolean;
}

export async function buildLiveTournamentSnapshot(seasonYear: number, options: { confirmedOnly?: boolean } = {}): Promise<LiveTournamentSnapshot> {
  const service = createSupabaseServiceRoleClient();

  let scoreQuery = service.from("live_hole_scores").select("player_slug, round, hole, score, putts, fir, gir, host_edited, confirmed_by").eq("season_year", seasonYear);
  if (options.confirmedOnly) scoreQuery = scoreQuery.not("confirmed_by", "is", null);
  const [{ data: rosterRows }, { data: courseRows }, { data: roundRows }, { data: boxRows }, { data: scoreRows }] = await Promise.all([
    service.from("live_roster").select("player_slug, team").eq("season_year", seasonYear),
    // live_courses is a shared pool across years (no season_year column), so this isn't filtered.
    service.from("live_courses").select("id, name, holes, rating, slope"),
    service.from("live_round_state").select("round, course_id").eq("season_year", seasonYear),
    service.from("live_match_boxes").select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started").eq("season_year", seasonYear),
    scoreQuery,
  ]);

  const players: LiveTournamentSnapshot["players"] = {};
  for (const row of (rosterRows as RosterRow[] | null) ?? []) {
    players[row.player_slug] = { team: row.team };
  }

  const courses: Record<string, LiveCourse> = {};
  for (const row of (courseRows as CourseRow[] | null) ?? []) {
    courses[row.id] = { id: row.id, name: row.name, holes: row.holes, rating: row.rating, slope: row.slope };
  }

  const roundCourses: Record<number, string> = {};
  for (const row of (roundRows as RoundStateRow[] | null) ?? []) {
    if (row.course_id) roundCourses[row.round] = row.course_id;
  }

  const matchBoxes: LiveMatchBox[] = ((boxRows as MatchBoxRow[] | null) ?? []).map((row) => ({
    id: row.id,
    seasonYear,
    round: row.round,
    boxNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  }));

  const scores = new Map<string, LiveHoleScore>();
  for (const row of (scoreRows as HoleScoreRow[] | null) ?? []) {
    scores.set(scoreKey(row.player_slug, row.round, row.hole), {
      player: row.player_slug,
      seasonYear,
      round: row.round,
      hole: row.hole,
      score: row.score,
      putts: row.putts,
      fir: row.fir,
      gir: row.gir,
      hostEdited: row.host_edited,
    });
  }

  return { players, courses, roundCourses, scores, matchBoxes };
}
