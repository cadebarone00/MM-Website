import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerDisplayName } from "@/lib/data/players";
import { getActiveSeasonYear } from "./activeSeason.ts";
import { effectiveMatchState } from "./orchestration.ts";
import { roundFinishedForPlayer } from "./roundStatus.ts";
import type { LiveMatch, LiveSessionState, LiveTournamentSnapshot, MatchFormat, MatchState } from "./types.ts";

export interface CurrentSessionResult {
  session: LiveSessionState;
  matchBox: LiveMatch;
  state: MatchState;
}

const EMPTY_SNAPSHOT: LiveTournamentSnapshot = {
  players: {},
  courses: {},
  roundCourses: {},
  scores: new Map(),
  matchBoxes: [],
};

/**
 * The next session relevant to this player: the lowest-numbered fully locked
 * session (course + matchups) that has a match containing them, whose
 * computed state isn't yet Final. Pure — no I/O — so the selection rule is
 * fully unit-testable without a live Supabase instance.
 */
export function pickCurrentSession(sessions: LiveSessionState[], matches: LiveMatch[], playerSlug: string): CurrentSessionResult | null {
  const lockedSessions = sessions.filter((s) => s.courseLocked && s.matchupsLocked).sort((a, b) => a.session - b.session);

  for (const session of lockedSessions) {
    const matchBox = matches.find(
      (match) => match.session === session.session && (match.maroonPlayers.includes(playerSlug) || match.whitePlayers.includes(playerSlug))
    );
    if (!matchBox) continue;

    const state = effectiveMatchState(EMPTY_SNAPSHOT, matchBox);
    if (state === "Final") continue;

    return { session, matchBox, state };
  }

  return null;
}

/**
 * "You & Cam vs. Drew & Hugo" (Fourball/Foursome) or "You vs. Drew"
 * (Singles) — this player's side first, teammate before opponents.
 */
export function matchupLabel(playerSlug: string, matchBox: LiveMatch): string {
  const onMaroon = matchBox.maroonPlayers.includes(playerSlug);
  const ownSide = onMaroon ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const otherSide = onMaroon ? matchBox.whitePlayers : matchBox.maroonPlayers;
  const teammates = ownSide.filter((slug) => slug !== playerSlug).map(getPlayerDisplayName);
  const opponents = otherSide.map(getPlayerDisplayName);
  return `${["You", ...teammates].join(" & ")} vs. ${opponents.join(" & ")}`;
}

interface SessionRow {
  round: number;
  started: boolean;
  course_id: string | null;
  date: string | null;
  format: string | null;
  course_locked: boolean;
  matchups_locked: boolean;
}

function sessionFromRow(row: SessionRow, seasonYear: number): LiveSessionState {
  return {
    seasonYear,
    session: row.round,
    started: row.started,
    courseId: row.course_id,
    date: row.date,
    format: row.format as MatchFormat | null,
    courseLocked: row.course_locked,
    matchupsLocked: row.matchups_locked,
    matchTeeTimes: [null, null, null],
  };
}

interface MatchRow {
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

function matchFromRow(row: MatchRow, seasonYear: number): LiveMatch {
  return {
    id: row.id,
    seasonYear,
    session: row.round,
    matchNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

// Not unit tested: createSupabaseServerClient() needs a real request
// lifecycle, same documented limitation as lib/portal/requireHost.test.mts
// and app/api/portal/profile/route.test.mts. pickCurrentSession() above (the
// actual selection rule) is where the real logic lives and is fully tested.
export async function findMatchesForPlayer(playerSlug: string, seasonYear: number): Promise<CurrentSessionResult[]> {
  const supabase = await createSupabaseServerClient();

  const [{ data: sessionRows, error: sessionError }, { data: matchRows, error: matchError }] = await Promise.all([
    supabase
      .from("live_round_state")
      .select("round, started, course_id, date, format, course_locked, matchups_locked")
      .eq("season_year", seasonYear)
      .order("round"),
    supabase
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", seasonYear)
      .order("round"),
  ]);

  if (sessionError) {
    console.error("Failed to fetch live_round_state:", sessionError);
  }
  if (matchError) {
    console.error("Failed to fetch live_match_boxes:", matchError);
  }

  const sessions = (sessionRows ?? []).map((row) => sessionFromRow(row, seasonYear));
  const matches = (matchRows ?? []).map((row) => matchFromRow(row, seasonYear));

  return sessions.filter((session) => session.courseLocked && session.matchupsLocked).flatMap((session) =>
    matches.filter((match) => match.session === session.session && (match.maroonPlayers.includes(playerSlug) || match.whitePlayers.includes(playerSlug)))
      .map((matchBox) => ({ session, matchBox, state: effectiveMatchState(EMPTY_SNAPSHOT, matchBox) }))
  );
}

/** A session is finished for a player once they and their scorer have both pressed Submit Round; the Scoring tab then moves on. */
export function withoutFinishedMatches(matches: CurrentSessionResult[], playerSlug: string, submissions: { match_box_id: string; player_slug: string }[]): CurrentSessionResult[] {
  return matches.filter((match) => {
    const submitted = submissions.filter((row) => row.match_box_id === match.matchBox.id).map((row) => row.player_slug);
    return !roundFinishedForPlayer(match.matchBox, playerSlug, submitted);
  });
}

export async function findUpcomingMatchesForPlayer(playerSlug: string): Promise<CurrentSessionResult[]> {
  const matches = (await findMatchesForPlayer(playerSlug, await getActiveSeasonYear())).filter((match) => match.state !== "Final");
  const ids = matches.map((match) => match.matchBox.id).filter((id): id is string => !!id);
  if (ids.length === 0) return matches;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("live_match_box_submissions").select("match_box_id, player_slug").in("match_box_id", ids);
  if (error) {
    console.error("Failed to fetch live_match_box_submissions:", error);
    return matches;
  }
  return withoutFinishedMatches(matches, playerSlug, data ?? []);
}

export async function findCurrentSessionForPlayer(playerSlug: string): Promise<CurrentSessionResult | null> {
  return (await findUpcomingMatchesForPlayer(playerSlug))[0] ?? null;
}
