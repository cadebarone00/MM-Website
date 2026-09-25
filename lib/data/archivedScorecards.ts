// lib/data/archivedScorecards.ts
import { nativeSeasonYear, getSeasonTournament } from "./seasonCatalog";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { r2PublicUrl } from "@/lib/r2/client";
import type { HoleStat, PlayerScorecard, RoundScorecard, Team, Tournament } from "./types";
import { matchCourseLibrary } from "./courseLibraryMatch";
import { canonicalCourseName } from "./canonicalCourse";
import { playerProfiles } from "./players";
import { getRoundFormatSetups, saveRoundFormatSetup } from "./roundFormatSetups";
import { getFutureHandicapRounds } from "@/lib/handicap/futureRounds";
import { getTournament } from "./index";
import type { ArchivedHandicapRound, ArchivedTeeSetup } from "@/lib/handicap/types";

/** Pure — no I/O. Defensively validates a `handicap_setup` jsonb value read back from archived_scorecard_rounds; malformed or never-assigned data becomes null rather than a bad round in the handicap archive. */
export { mapHandicapSetup } from "@/lib/handicap/teeSetup";
import { mapHandicapSetup } from "@/lib/handicap/teeSetup";

/** Read the player's complete archive without copying or changing official scores. */
export async function getArchivedHandicapRounds(playerSlug: string): Promise<ArchivedHandicapRound[]> {
  const service = createSupabaseServiceRoleClient();
  const rounds: (RoundRow & { tournament_slug: string })[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("archived_scorecard_rounds")
      .select("id, player_slug, tournament_slug, round, course, format, handicap_setup, played_on")
      .eq("player_slug", playerSlug).order("id").range(from, from + 999);
    if (error) throw new Error("Could not load archived handicap rounds.");
    rounds.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const totals = new Map<string, { total: number; holes: number }>();
  // Batch IDs and paginate holes so a long career cannot hit the response cap.
  for (let offset = 0; offset < rounds.length; offset += 100) {
    const ids = rounds.slice(offset, offset + 100).map((round) => round.id);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service.from("archived_scorecard_holes")
        .select("round_id, hole, score").in("round_id", ids)
        .order("round_id").order("hole").range(from, from + 999);
      if (error) throw new Error("Could not load archived handicap scores.");
      for (const hole of data ?? []) {
        if (hole.score <= 0) continue;
        const total = totals.get(hole.round_id) ?? { total: 0, holes: 0 };
        total.total += hole.score;
        total.holes += 1;
        totals.set(hole.round_id, total);
      }
      if (!data || data.length < 1000) break;
    }
  }
  const { data: library, error: libraryError } = await service.from("live_courses").select("id, name");
  if (libraryError) throw new Error("Could not match archived courses to the course library.");
  const setups = await getRoundFormatSetups();
  const historical = rounds.map((round) => {
    const tournament = getTournament(round.tournament_slug);
    const total = totals.get(round.id);
    const setup = setups.find((entry) => entry.seasonYear === tournament?.year && entry.round === round.round);
    const teeSetup = mapHandicapSetup(setup ? setup.teeSetup : round.handicap_setup);
    const course = (library ?? []).find((entry) => entry.id === teeSetup?.courseId) ?? matchCourseLibrary(round.course, library ?? []);
    return {
      id: round.id,
      tournamentSlug: round.tournament_slug,
      tournamentLabel: tournament?.editionLabel ?? round.tournament_slug,
      tournamentDate: tournament?.startDate ?? "",
      round: round.round,
      courseName: setup?.courseName ?? course?.name ?? round.course,
      courseLibraryId: course?.id ?? null,
      format: round.format,
      totalScore: total?.total ?? null,
      holesPlayed: total?.holes ?? 0,
      datePlayed: setup?.datePlayed ?? round.played_on ?? null,
      teeSetup,
    };
  });
  const future = await getFutureHandicapRounds(playerSlug, setups);
  const historicalKeys = new Set(rounds.map((r) => `${getTournament(r.tournament_slug)?.year}:${r.round}`));
  return [...historical, ...future.filter((r) => !historicalKeys.has(`${r.seasonYear}:${r.round}`))];
}

export interface OrphanArchivedRound {
  setup?: import("./roundFormatSetups").RoundFormatSetup | null;
  round: number;
  format: string | null;
  players: string[]; // player slugs, sorted
}

/**
 * Archived rounds for a tournament that fall outside its match-play
 * schedule — e.g. 2025-danzante's Round INDI (round 0), an
 * individual-champion round with no Maroon-vs-White matchup at all. Used
 * by the Round & Format Archive to surface these alongside the real
 * schedule instead of silently dropping them. `knownRounds` is the count
 * from `roundFormatArchive` — any archived round number outside 1..that
 * count is treated as an orphan.
 */
export async function getOrphanArchivedRounds(tournamentSlug: string, knownRounds: number): Promise<OrphanArchivedRound[]> {
  const service = createSupabaseServiceRoleClient();
  const rows = await fetchAllRows<{ round: number; format: string | null; player_slug: string }>("getOrphanArchivedRounds", (from, to) =>
    service.from("archived_scorecard_rounds").select("round, format, player_slug").eq("tournament_slug", tournamentSlug).range(from, to)
  );
  const groups = new Map<number, OrphanArchivedRound>();
  for (const row of rows) {
    if (row.round >= 1 && row.round <= knownRounds) continue; // already covered by the match schedule
    const group = groups.get(row.round) ?? { round: row.round, format: row.format, players: [] };
    group.players.push(row.player_slug);
    groups.set(row.round, group);
  }
  return [...groups.values()].map((group) => ({ ...group, players: group.players.sort() })).sort((a, b) => a.round - b.round);
}

// PostgREST caps a single request at 1000 rows by default — silently, with
// no error, just a truncated result. A whole tournament's hole rows (players
// × rounds × 18) crosses that once there are enough players/rounds (2026
// Palm Springs already does: 12 players × 6 rounds × 18 holes = 1296), so
// any query that can return "every hole row for a tournament" has to page
// through results rather than assume one request covers everything.
const MAX_ROWS_PER_PAGE = 1000;

async function fetchAllRows<T>(
  label: string,
  runQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await runQuery(from, from + MAX_ROWS_PER_PAGE - 1);
    if (error) {
      console.error(`${label}: failed to load a page`, error);
      break;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < MAX_ROWS_PER_PAGE) break;
    from += MAX_ROWS_PER_PAGE;
  }
  return rows;
}

interface RoundRow {
  id: string;
  player_slug: string;
  round: number;
  course: string;
  format: string | null;
  handicap_setup?: unknown;
  played_on?: string | null;
}

interface HoleRow {
  round_id: string;
  hole: number;
  par: number;
  yards: number;
  score: number;
  putts: number;
  fir: string;
  gir: boolean;
}

function toHoleStat(row: HoleRow): HoleStat {
  return {
    hole: row.hole,
    par: row.par,
    yards: row.yards,
    score: row.score,
    putts: row.putts,
    fir: row.fir === "X" ? "X" : Number(row.fir),
    gir: row.gir ? 1 : 0,
    diff: row.score > 0 ? row.score - row.par : 0,
  };
}

function toRoundScorecard(round: RoundRow, holes: HoleRow[]): RoundScorecard {
  const holeStats = holes.filter((h) => h.round_id === round.id).sort((a, b) => a.hole - b.hole).map(toHoleStat);
  const played = holeStats.filter((h) => h.score > 0);
  const firApplicable = holeStats.filter((h) => h.fir !== "X");
  return {
    round: round.round,
    course: round.course,
    format: round.format ?? undefined,
    total: played.reduce((s, h) => s + h.score, 0),
    toPar: played.reduce((s, h) => s + (h.score - h.par), 0),
    putts: played.reduce((s, h) => s + h.putts, 0),
    girHit: holeStats.filter((h) => h.gir === 1).length,
    girTotal: holeStats.length,
    firHit: firApplicable.filter((h) => h.fir === 1).length,
    firTotal: firApplicable.length,
    holes: holeStats,
  };
}

function teamFor(roster: Tournament["roster"], playerId: string): Team {
  return roster.maroon.some((n) => n.toLowerCase() === playerId.toLowerCase()) ? "maroon" : "white";
}

/**
 * Every player's full scorecard for a played tournament, sourced from the
 * database — this is what gets attached as `Tournament.scorecards` at the
 * two public pages that need it (Task 4), replacing the old hardcoded
 * `scorecards2025`/`scorecards2026` file imports.
 */
export async function getScorecardsForTournament(tournament: Pick<Tournament, "slug" | "roster">): Promise<PlayerScorecard[]> {
  const nativeYear = nativeSeasonYear(tournament.slug);
  if (nativeYear) return (await getSeasonTournament(nativeYear)).scorecards ?? [];
  const service = createSupabaseServiceRoleClient();
  const rounds = await fetchAllRows<RoundRow>("getScorecardsForTournament", (from, to) =>
    service
      .from("archived_scorecard_rounds")
      .select("id, player_slug, round, course, format")
      .eq("tournament_slug", tournament.slug)
      .range(from, to)
  );
  if (rounds.length === 0) return [];

  const roundIds = rounds.map((r) => r.id);
  const holes = await fetchAllRows<HoleRow>("getScorecardsForTournament", (from, to) =>
    service
      .from("archived_scorecard_holes")
      .select("round_id, hole, par, yards, score, putts, fir, gir")
      .in("round_id", roundIds)
      .range(from, to)
  );

  const bySlug = new Map<string, RoundRow[]>();
  for (const round of rounds) {
    const arr = bySlug.get(round.player_slug) ?? [];
    arr.push(round);
    bySlug.set(round.player_slug, arr);
  }

  return [...bySlug.entries()].map(([slug, playerRounds]) => {
    const profile = playerProfiles.find((p) => p.slug === slug);
    const playerId = profile?.id ?? slug;
    return {
      player: playerId,
      team: teamFor(tournament.roster, playerId),
      rounds: playerRounds.sort((a, b) => a.round - b.round).map((r) => toRoundScorecard(r, holes)),
    };
  });
}

/** Distinct rounds recorded for a tournament (any player), for the Tiger Center's "assign tees to a round" picker — one entry per round number, not per player. `assigned` is true once any player row for that round already carries a tee setup. */
export async function getArchivedTournamentRounds(tournamentSlug: string): Promise<{ round: number; course: string; format: string | null; assigned: boolean }[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("archived_scorecard_rounds")
    .select("round, course, format, handicap_setup")
    .eq("tournament_slug", tournamentSlug)
    .order("round");
  if (error) {
    console.error("getArchivedTournamentRounds: failed to load rounds", error);
    return [];
  }
  const sharedSetups = (await getRoundFormatSetups()).filter((s) => s.seasonYear === getTournament(tournamentSlug)?.year);
  const byRound = new Map<number, { round: number; course: string; format: string | null; assigned: boolean }>();
  for (const row of data ?? []) {
    const existing = byRound.get(row.round);
    const shared = sharedSetups.find((s) => s.round === row.round);
    const assigned = mapHandicapSetup(shared ? shared.teeSetup : row.handicap_setup) != null;
    // canonicalCourseName matches how the round archive on Career Stats
    // (CareerRoundArchive.tsx, via getCareerStatsDatabase) displays course
    // names, so Tiger sees the same label in both places for the same round.
    const course = shared?.courseName ?? canonicalCourseName(row.course);
    if (!existing) byRound.set(row.round, { round: row.round, course, format: row.format, assigned });
    else if (assigned) existing.assigned = true;
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

/** Bulk-assigns a tee setup (and the date it was played) to every player's archived row for one tournament + round — same course/tees for the whole field, matching how a round is already modeled during live scoring. */
export async function assignArchiveTeeSetup(
  tournamentSlug: string,
  round: number,
  teeSetup: ArchivedTeeSetup,
  datePlayed: string
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const service = createSupabaseServiceRoleClient();
  const tournament = getTournament(tournamentSlug);
  if (!tournament) return { ok: false, error: "Unknown archived tournament." };
  const { count, error } = await service.from("archived_scorecard_rounds").select("id", { count: "exact", head: true }).eq("tournament_slug", tournamentSlug).eq("round", round);
  if (error || !count) return { ok: false, error: "No archived rounds found for that tournament and round." };
  const { data: course } = await service.from("live_courses").select("name").eq("id", teeSetup.courseId).maybeSingle();
  try {
    await saveRoundFormatSetup({ seasonYear: tournament.year, round, courseName: course?.name ?? teeSetup.courseId, datePlayed, teeSetup });
    return { ok: true, updated: count };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not save round setup." }; }

}

/** Round labels for the Tiger Center's player → rounds list ("Round 1 — Palmer"). */
export async function getArchivedRoundLabels(
  tournamentSlug: string,
  playerSlug: string
): Promise<{ round: number; course: string; format: string | null }[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("archived_scorecard_rounds")
    .select("round, course, format")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .order("round");
  if (error) {
    console.error("getArchivedRoundLabels: failed to load round labels", error);
  }
  return data ?? [];
}

/** One round's full hole-by-hole scorecard — used by both the public page and the Tiger Center editor. */
export async function getArchivedRoundScorecard(tournamentSlug: string, playerSlug: string, round: number): Promise<RoundScorecard | null> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRow, error: roundError } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course, format")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (roundError) {
    console.error("getArchivedRoundScorecard: failed to load round", roundError);
  }
  if (!roundRow) return null;

  const { data: holeRows, error: holesError } = await service
    .from("archived_scorecard_holes")
    .select("round_id, hole, par, yards, score, putts, fir, gir")
    .eq("round_id", roundRow.id);
  if (holesError) {
    console.error("getArchivedRoundScorecard: failed to load holes", holesError);
  }

  return toRoundScorecard(roundRow as RoundRow, (holeRows ?? []) as HoleRow[]);
}

/** hole -> shot number -> public video URL, for a round. Empty object if nothing's uploaded yet. */
export async function getShotVideoUrls(tournamentSlug: string, playerSlug: string, round: number): Promise<Record<number, Record<number, string>>> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRow, error: roundError } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (roundError) {
    console.error("getShotVideoUrls: failed to load round", roundError);
  }
  if (!roundRow) return {};

  const { data: videoRows, error: videosError } = await service
    .from("archived_shot_videos")
    .select("hole, shot_number, storage_path")
    .eq("round_id", roundRow.id);
  if (videosError) {
    console.error("getShotVideoUrls: failed to load videos", videosError);
  }

  const result: Record<number, Record<number, string>> = {};
  for (const row of videoRows ?? []) {
    result[row.hole] = result[row.hole] ?? {};
    result[row.hole][row.shot_number] = r2PublicUrl(row.storage_path);
  }
  return result;
}
