import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerDisplayName } from "@/lib/data/players";
import { getActiveSeasonYear } from "./activeSeason.ts";
import { effectiveMatchState } from "./orchestration.ts";
import type { LiveMatchBox, LiveRoundState, LiveTournamentSnapshot, MatchFormat, MatchState } from "./types.ts";

export interface CurrentRoundResult {
  round: LiveRoundState;
  matchBox: LiveMatchBox;
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
 * The next round relevant to this player: the lowest-numbered fully locked
 * round (course + matchups) that has a match box containing them, whose
 * computed state isn't yet Final. Pure — no I/O — so the selection rule is
 * fully unit-testable without a live Supabase instance.
 */
export function pickCurrentRound(rounds: LiveRoundState[], matchBoxes: LiveMatchBox[], playerSlug: string): CurrentRoundResult | null {
  const lockedRounds = rounds.filter((r) => r.courseLocked && r.matchupsLocked).sort((a, b) => a.round - b.round);

  for (const round of lockedRounds) {
    const matchBox = matchBoxes.find(
      (box) => box.round === round.round && (box.maroonPlayers.includes(playerSlug) || box.whitePlayers.includes(playerSlug))
    );
    if (!matchBox) continue;

    const state = effectiveMatchState(EMPTY_SNAPSHOT, matchBox);
    if (state === "Final") continue;

    return { round, matchBox, state };
  }

  return null;
}

/**
 * "You & Cam vs. Drew & Hugo" (Fourball/Foursome) or "You vs. Drew"
 * (Singles) — this player's side first, teammate before opponents.
 */
export function matchupLabel(playerSlug: string, matchBox: LiveMatchBox): string {
  const onMaroon = matchBox.maroonPlayers.includes(playerSlug);
  const ownSide = onMaroon ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const otherSide = onMaroon ? matchBox.whitePlayers : matchBox.maroonPlayers;
  const teammates = ownSide.filter((slug) => slug !== playerSlug).map(getPlayerDisplayName);
  const opponents = otherSide.map(getPlayerDisplayName);
  return `${["You", ...teammates].join(" & ")} vs. ${opponents.join(" & ")}`;
}

interface RoundRow {
  round: number;
  started: boolean;
  course_id: string | null;
  date: string | null;
  format: string | null;
  course_locked: boolean;
  matchups_locked: boolean;
}

function roundFromRow(row: RoundRow, seasonYear: number): LiveRoundState {
  return {
    seasonYear,
    round: row.round,
    started: row.started,
    courseId: row.course_id,
    date: row.date,
    format: row.format as MatchFormat | null,
    courseLocked: row.course_locked,
    matchupsLocked: row.matchups_locked,
  };
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

function matchBoxFromRow(row: MatchBoxRow, seasonYear: number): LiveMatchBox {
  return {
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
  };
}

// Not unit tested: createSupabaseServerClient() needs a real request
// lifecycle, same documented limitation as lib/portal/requireHost.test.mts
// and app/api/portal/profile/route.test.mts. pickCurrentRound() above (the
// actual selection rule) is where the real logic lives and is fully tested.
export async function findCurrentRoundForPlayer(playerSlug: string): Promise<CurrentRoundResult | null> {
  const supabase = await createSupabaseServerClient();
  const seasonYear = await getActiveSeasonYear();

  const [{ data: roundRows, error: roundError }, { data: boxRows, error: boxError }] = await Promise.all([
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

  if (roundError) {
    console.error("Failed to fetch live_round_state:", roundError);
  }
  if (boxError) {
    console.error("Failed to fetch live_match_boxes:", boxError);
  }

  const rounds = (roundRows ?? []).map((row) => roundFromRow(row, seasonYear));
  const matchBoxes = (boxRows ?? []).map((row) => matchBoxFromRow(row, seasonYear));

  return pickCurrentRound(rounds, matchBoxes, playerSlug);
}
