import { generatedCareerRound } from "./roundIdentity";
import { careerRoundKey, mergeCareerRecords } from "./mergeCareerRecords";
import { isIndividualScoreFormat } from "@/lib/handicap/archiveIndex";
import { getPlayerSlug } from "./players";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { canonicalCourseName } from "@/lib/data/canonicalCourse";
import type { CareerHoleRecord, CareerPartnership, CareerTeamHoleRecord } from "./careerStats";
import { buildHandicapCareerRecords, type PersonalRoundRow, type PersonalHoleRow } from "./handicapCareerRecords";

type HoleRow = { year: number; player: string; round: number; round_holes: number | null; course: string; format: string | null; hole: number; par: number; yards: number; score: number; putts: number | null; fairway_in_regulation: boolean | null; green_in_regulation: boolean | null; penalties: number | null };

async function loadAll<T>(table: string, order: string[] = []): Promise<{ rows: T[]; ready: boolean }> {
  const service = createSupabaseServiceRoleClient();
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query = service.from(table).select("*");
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(from, from + 999);
    if (error) return { rows: [], ready: false };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return { rows, ready: true };
  }
}

export async function getHandicapCareerRecords(): Promise<CareerHoleRecord[]> {
  const [rounds, holes, courses] = await Promise.all([
    loadAll<PersonalRoundRow>("handicap_rounds", ["id"]),
    loadAll<PersonalHoleRow>("handicap_round_holes", ["round_id", "hole"]),
    loadAll<{ id: string; name: string }>("live_courses", ["id"]),
  ]);
  if (!rounds.ready || !holes.ready || !courses.ready) throw new Error("Could not load submitted rounds for the Career Archive.");
  return buildHandicapCareerRecords(rounds.rows, holes.rows, courses.rows);
}

export async function getCareerStatsDatabase() {
  const [holes, participants, edited] = await Promise.all([
    loadAll<HoleRow>("career_stat_holes"),
    loadAll<{ player: string; partner: string | null; year: number; format: string | null; team_id: string | null; winning_side: string | null }>("career_match_participants"),
    getHistoricalCareerRecords(),
  ]);
  return {
    records: mergeCareerRecords(holes.rows.filter((row) => (row.round_holes ?? 18) === 18).map((row): CareerHoleRecord => ({ year: row.year, player: getPlayerSlug(row.player), round: generatedCareerRound(row.year, row.round), roundHoles: row.round_holes ?? 18, course: canonicalCourseName(row.course), format: row.format ?? "Unspecified", hole: row.hole, par: row.par, yards: row.yards, score: row.score, putts: row.putts, fairwayInRegulation: row.fairway_in_regulation, greenInRegulation: row.green_in_regulation, penalties: row.penalties })), edited.records, edited.keys),
    partnerships: participants.rows.filter((row) => row.partner).map((row): CareerPartnership => ({
      player: getPlayerSlug(row.player), partner: getPlayerSlug(row.partner!), year: row.year, format: row.format ?? "Unspecified",
      result: row.winning_side?.toUpperCase() === "HALVED" ? "halve" : row.winning_side?.toUpperCase() === row.team_id?.toUpperCase() ? "win" : "loss",
    })),
    databaseReady: holes.ready && participants.ready,
  };
}

/** Live archive rows are the 2027+ extension of Career Stats. The archive
 * contains confirmed scores only (enforced by live_match_publication.sql).
 * Partial Singles/Fourball rounds deliberately feed the raw model pool as
 * confirmed holes arrive; nine-hole historical rounds stay excluded by the
 * odds model's eligibility rule. */
export async function getLiveCareerArchiveRecords(options: { includeTestSeason?: boolean } = {}): Promise<CareerHoleRecord[]> {
  type LiveRound = { season_year: number; round: number; player_slug: string; course: string; format: string; holes: { number: number; par: number; yards: number }[] };
  type LiveHole = { season_year: number; round: number; player_slug: string; hole: number; score: number; putts: number | null; fir: boolean | null; gir: boolean | null; did_not_finish: boolean };
  const [roundData, holeData] = await Promise.all([
    loadAll<LiveRound>("career_archive_rounds", ["season_year", "round", "player_slug"]),
    loadAll<LiveHole>("career_archive_live_holes", ["season_year", "round", "player_slug", "hole"]),
  ]);
  if (!roundData.ready || !holeData.ready) throw new Error("Could not load confirmed tournament scores.");
  const rounds = roundData.rows, holes = holeData.rows;
  const permittedRounds = (rounds ?? []).filter((row) => options.includeTestSeason || row.season_year !== 2034);
  const permittedSeasonYears = new Set(permittedRounds.map((row) => row.season_year as number));
  const metadata = new Map(permittedRounds.map((row) => [`${row.season_year}:${row.round}:${row.player_slug}`, row]));
  const counts = new Map<string, number>();
  (holes ?? []).filter((row) => permittedSeasonYears.has(row.season_year as number) && row.score != null && row.score > 0).forEach((row) => { const id = `${row.season_year}:${row.round}:${row.player_slug}`; counts.set(id, (counts.get(id) ?? 0) + 1); });
  return (holes ?? []).filter((row) => permittedSeasonYears.has(row.season_year as number) && row.score != null && row.score > 0 && !row.did_not_finish).flatMap((row): CareerHoleRecord[] => {
    const id = `${row.season_year}:${row.round}:${row.player_slug}`;
    const round = metadata.get(id);
    const setup = (round as { holes?: { number: number; par: number; yards: number }[] } | undefined)?.holes;
    const hole = setup?.find((entry) => entry.number === row.hole);
    if (!round || !hole) return [];
    return [{ year: row.season_year, player: getPlayerSlug(row.player_slug), round: row.round, roundHoles: counts.get(id) ?? 0, course: canonicalCourseName(round.course), format: round.format, hole: row.hole, par: hole.par, yards: hole.yards, score: row.score, putts: row.putts, fairwayInRegulation: row.fir, greenInRegulation: row.gir, penalties: null }];
  });
}

/** Foursome's live shared-ball observations are deliberately read from a
 * separate archive. The model calls the format "Alternate Shot" to match
 * the historical workbook vocabulary; the application calls it Foursome. */
export async function getLiveCareerArchiveTeamRecords(options: { includeTestSeason?: boolean } = {}): Promise<CareerTeamHoleRecord[]> {
  type TeamRow = { season_year: number; round: number; match_box_id: string; team: string; player_1: string; player_2: string; course: string; hole: number; par: number; yards: number; team_score: number };
  const { rows: data, ready } = await loadAll<TeamRow>("career_archive_team_holes", ["season_year", "round", "match_box_id", "team", "hole"]);
  if (!ready) throw new Error("Could not load confirmed team scores.");
  return (data ?? []).filter((row) => options.includeTestSeason || row.season_year !== 2034).map((row) => ({
    year: row.season_year as number,
    round: row.round as number,
    format: "Alternate Shot",
    matchId: row.match_box_id as string,
    teamId: String(row.team).toUpperCase(),
    player1: getPlayerSlug(row.player_1 as string),
    player2: getPlayerSlug(row.player_2 as string),
    course: canonicalCourseName(row.course as string),
    hole: row.hole as number,
    par: row.par as number,
    yards: row.yards as number,
    score: row.team_score as number,
    putts: null,
    fairwayInRegulation: null,
    greenInRegulation: null,
    penalties: null,
  }));
}

export async function getHistoricalCareerRecords() {
  const [rounds, holes] = await Promise.all([
    loadAll<{ id: string; tournament_slug: string; player_slug: string; round: number; course: string; format: string | null }>("archived_scorecard_rounds", ["id"]),
    loadAll<{ round_id: string; hole: number; par: number; yards: number; score: number; putts: number; fir: string; gir: boolean }>("archived_scorecard_holes", ["round_id", "hole"]),
  ]);
  if (!rounds.ready || !holes.ready) throw new Error("Could not load editable historical scores.");
  const keys = new Set<string>();
  const records: CareerHoleRecord[] = rounds.rows.flatMap((round) => {
    const year = Number(round.tournament_slug.slice(0,4));
    if (!Number.isInteger(year)) return [];
    keys.add(careerRoundKey(year,round.player_slug,round.round));
    if (!isIndividualScoreFormat(round.format)) return [];
    const entries = holes.rows.filter((hole) => hole.round_id === round.id && hole.score > 0);
    return entries.map((hole) => ({ year, player: getPlayerSlug(round.player_slug), round: round.round, roundHoles: entries.length,
      course: canonicalCourseName(round.course), format: round.format ?? "Unspecified", hole: hole.hole, par: hole.par, yards: hole.yards,
      score: hole.score, putts: hole.putts, fairwayInRegulation: hole.par === 3 || hole.fir === "X" ? null : hole.fir === "1", greenInRegulation: hole.gir, penalties: null }));
  });
  return { records, keys };
}
