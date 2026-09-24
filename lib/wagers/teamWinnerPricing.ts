import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { careerArchiveCourseHoles } from "@/lib/data/careerArchive.generated";
import type { CareerCourseHole } from "@/lib/data/careerStats";
import { getPlayerDisplayName, getPlayerSlug } from "@/lib/data/players";
import { calculatePreRoundAlternateShotOdds, calculatePreRoundFourballOdds, calculatePreRoundSinglesOdds, type PreRoundSinglesResult } from "@/lib/odds/preRoundSingles";
import { isTestSeason } from "@/lib/live/testSeason";
import type { LiveTournamentSnapshot } from "@/lib/live/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { latestMatchInput, later, pages, type Service } from "./futureInputs";
import {
  TEAM_WINNER_MODEL_VERSION,
  TEAM_WINNER_SIMULATIONS,
  decidedResult,
  fairAmericanOdds,
  missingOdds,
  simulateTeamWinner,
  teamPoints,
  teamWinnerMarket,
  type FutureFormat,
  type FutureRound,
  type Matchup,
  type Outcome,
  type Result,
  type Roster,
} from "./teamWinnerFuture";

type Inputs = {
  rounds: FutureRound[];
  roster: Roster;
  blockers: string[];
  snapshot: LiveTournamentSnapshot;
  /** Newest match odds / official state the inputs include. */
  inputsAsOf: string | null;
};

/** Reads every round, the roster, finished results, and the latest odds of each paired match. */
async function loadInputs(service: Service, seasonYear: number): Promise<Inputs> {
  const [{ data: settings, error: settingsError }, roundRows, stateRows, oddsRows, snapshot] = await Promise.all([
    service.from("live_tournament_settings").select("round_count").eq("season_year", seasonYear).maybeSingle(),
    pages<{ round: number; format: FutureFormat | null; matchups_locked: boolean }>((from, to) => service.from("live_round_state").select("round, format, matchups_locked").eq("season_year", seasonYear).order("round").range(from, to)),
    pages<{ match_box_id: string; status: string; official_result: Result | null; updated_at: string }>((from, to) => service.from("live_match_official_state").select("match_box_id, status, official_result, updated_at").eq("season_year", seasonYear).order("match_box_id").range(from, to)),
    pages<{ match_box_id: string; maroon_win_probability: number; tie_probability: number; white_win_probability: number; created_at: string }>((from, to) =>
      service.from("live_match_odds_snapshots").select("match_box_id, maroon_win_probability, tie_probability, white_win_probability, created_at").eq("season_year", seasonYear).order("created_at", { ascending: false }).range(from, to)),
    buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true }),
  ]);
  if (settingsError) throw new Error(settingsError.message);

  let inputsAsOf: string | null = null;
  const states = new Map(stateRows.map((row) => [row.match_box_id, row]));
  stateRows.forEach((row) => { inputsAsOf = later(inputsAsOf, row.updated_at); });
  const latestOdds = new Map<string, Outcome>();
  for (const row of oddsRows) {
    inputsAsOf = later(inputsAsOf, row.created_at);
    if (!latestOdds.has(row.match_box_id)) latestOdds.set(row.match_box_id, { maroon: Number(row.maroon_win_probability), tie: Number(row.tie_probability), white: Number(row.white_win_probability) });
  }

  const roster: Roster = { maroon: [], white: [] };
  for (const [player, { team }] of Object.entries(snapshot.players)) roster[team].push(player);
  roster.maroon.sort();
  roster.white.sort();

  const blockers: string[] = [];
  const roundCount = settings?.round_count ?? null;
  if (!roundCount) blockers.push("Tiger hasn't set the number of rounds yet.");
  if (!roster.maroon.length || !roster.white.length) blockers.push("Both team rosters need to be set.");

  const rounds: FutureRound[] = [];
  for (let number = 1; number <= (roundCount ?? 0); number += 1) {
    const row = roundRows.find((candidate) => candidate.round === number);
    const courseKey = snapshot.roundCourses[number];
    if (!row?.format) { blockers.push(`Round ${number} needs a format.`); continue; }
    if (!courseKey) { blockers.push(`Round ${number} needs a course.`); continue; }
    const boxes = snapshot.matchBoxes.filter((box) => box.round === number && box.id);
    rounds.push({
      round: number,
      format: row.format,
      courseKey,
      matches: row.matchups_locked && boxes.length
        ? boxes.map((box) => {
            const state = states.get(box.id!);
            const result = state && (state.status === "complete" || state.status === "closed_out") ? state.official_result : null;
            return { maroon: box.maroonPlayers, white: box.whitePlayers, result, odds: result ? null : latestOdds.get(box.id!) ?? null };
          })
        : null,
    });
  }
  return { rounds, roster, blockers, snapshot, inputsAsOf };
}

async function loadPairTable(service: Service, seasonYear: number): Promise<Map<string, Outcome>> {
  const rows = await pages<{ pair_key: string; maroon_win_probability: number; tie_probability: number; white_win_probability: number }>((from, to) =>
    service.from("team_winner_pair_odds").select("pair_key, maroon_win_probability, tie_probability, white_win_probability").eq("season_year", seasonYear).order("pair_key").range(from, to));
  return new Map(rows.map((row) => [row.pair_key, { maroon: Number(row.maroon_win_probability), tie: Number(row.tie_probability), white: Number(row.white_win_probability) }]));
}

type Archive = Awaited<ReturnType<typeof getCombinedCareerArchive>>;

/** One matchup through the canonical pre-round match model — the same engine live match odds use. */
function priceMatchup(matchup: Matchup, snapshot: LiveTournamentSnapshot, archive: Archive, seasonYear: number): PreRoundSinglesResult | null {
  const course = snapshot.courses[matchup.courseKey];
  if (!course) return null;
  const courseHoles: CareerCourseHole[] = course.holes.map((hole) => ({ year: seasonYear, course: course.name, tee: null, hole: hole.number, par: hole.par, yards: hole.yards, holeType: `Par ${hole.par}`, holeLengthBucket: null }));
  const common = { records: archive.records, courseHoles: [...careerArchiveCourseHoles, ...courseHoles], course: course.name };
  const a = matchup.maroon.map(getPlayerSlug);
  const b = matchup.white.map(getPlayerSlug);
  if (matchup.format === "Singles") return calculatePreRoundSinglesOdds({ ...common, playerA: a[0], playerB: b[0] });
  if (matchup.format === "Fourball") return calculatePreRoundFourballOdds({ ...common, teamA: [a[0], a[1]], teamB: [b[0], b[1]] });
  return calculatePreRoundAlternateShotOdds({ ...common, teamRecords: archive.teamRecords, teamA: [a[0], a[1]], teamB: [b[0], b[1]] });
}

const sideName = (players: string[]) => players.map(getPlayerDisplayName).join(" & ");

export type PricingProgress = { priced: number; remaining: number; failures: string[]; blockers: string[] };

/**
 * Tiger-only, resumable: prices missing matchups until `budgetMs` runs out and
 * saves them, so a long first run finishes over several requests instead of
 * hitting a server timeout. `reset` discards the season's saved matchup odds
 * first (e.g. after the Career Archive changed).
 */
export async function priceTeamWinnerMatchups(seasonYear: number, { budgetMs, reset = false }: { budgetMs: number; reset?: boolean }): Promise<PricingProgress> {
  const started = Date.now();
  const service = createSupabaseServiceRoleClient();
  if (reset) {
    const { error } = await service.from("team_winner_pair_odds").delete().eq("season_year", seasonYear);
    if (error) throw new Error(error.message);
  }
  const [inputs, pairTable] = await Promise.all([loadInputs(service, seasonYear), loadPairTable(service, seasonYear)]);
  if (inputs.blockers.length) return { priced: 0, remaining: 0, failures: [], blockers: inputs.blockers };

  const missing = missingOdds(inputs.rounds, inputs.roster, pairTable);
  if (!missing.length) return { priced: 0, remaining: 0, failures: [], blockers: [] };
  const archive = await getCombinedCareerArchive({ includeTestSeason: isTestSeason(seasonYear) });

  const rows: Record<string, unknown>[] = [];
  const failures: string[] = [];
  let attempted = 0;
  for (const matchup of missing) {
    if (Date.now() - started > budgetMs) break;
    attempted += 1;
    const result = priceMatchup(matchup, inputs.snapshot, archive, seasonYear);
    if (!result) {
      failures.push(`${matchup.format}: ${sideName(matchup.maroon)} vs ${sideName(matchup.white)} — not enough Career Archive history on this course.`);
      continue;
    }
    rows.push({ season_year: seasonYear, pair_key: matchup.key, maroon_win_probability: result.a, tie_probability: result.tie, white_win_probability: result.b, model_version: TEAM_WINNER_MODEL_VERSION });
  }
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await service.from("team_winner_pair_odds").upsert(rows.slice(index, index + 500), { onConflict: "season_year,pair_key" });
    if (error) throw new Error(error.message);
  }
  return { priced: rows.length, remaining: missing.length - attempted, failures, blockers: [] };
}

/**
 * Cheap: simulates the rest of the tournament from saved matchup odds and the
 * latest live match odds, then publishes a new snapshot. Runs after every
 * official match update and after Tiger prices matchups.
 */
export async function publishTeamWinnerOdds(seasonYear: number) {
  const service = createSupabaseServiceRoleClient();
  const [inputs, pairTable] = await Promise.all([loadInputs(service, seasonYear), loadPairTable(service, seasonYear)]);
  const points = teamPoints(inputs.rounds, inputs.roster);
  const blockers = [...inputs.blockers];
  const missing = inputs.blockers.length ? [] : missingOdds(inputs.rounds, inputs.roster, pairTable);
  if (missing.length) blockers.push(`${missing.length} possible matchups still need pricing — Tiger: press Price Team Winner.`);

  const decided = blockers.length ? null : decidedResult(points);
  const outcome: Outcome | null = blockers.length
    ? null
    : decided
      ? { maroon: decided === "maroon" ? 1 : 0, tie: decided === "tie" ? 1 : 0, white: decided === "white" ? 1 : 0 }
      : simulateTeamWinner({ rounds: inputs.rounds, roster: inputs.roster, pairTable });

  const row = {
    season_year: seasonYear,
    model_version: TEAM_WINNER_MODEL_VERSION,
    maroon_win_probability: outcome?.maroon ?? null,
    tie_probability: outcome?.tie ?? null,
    white_win_probability: outcome?.white ?? null,
    maroon_american_odds: outcome ? fairAmericanOdds(outcome.maroon) : null,
    tie_american_odds: outcome ? fairAmericanOdds(outcome.tie) : null,
    white_american_odds: outcome ? fairAmericanOdds(outcome.white) : null,
    maroon_points: points.maroon,
    white_points: points.white,
    points_remaining: points.remaining,
    decided_result: decided,
    blockers,
    inputs_as_of: inputs.inputsAsOf,
    details: {
      simulations: TEAM_WINNER_SIMULATIONS,
      rounds: inputs.rounds.map((round) => ({ round: round.round, format: round.format, paired: round.matches !== null })),
    },
  };
  const { error } = await service.from("team_winner_odds_snapshots").insert(row);
  if (error) throw new Error(error.message);
  return row;
}

/** Never lets a Team Winner refresh fail the match publication that triggered it. */
export async function refreshTeamWinnerOdds(seasonYear: number) {
  try {
    await publishTeamWinnerOdds(seasonYear);
  } catch (error) {
    console.error("Team Winner odds refresh failed:", error);
  }
}

export type TeamWinnerStatus = "not_ready" | "open" | "updating" | "decided" | "settled";

export type TeamWinnerState = {
  seasonYear: number;
  status: TeamWinnerStatus;
  probabilities: Outcome | null;
  market: ReturnType<typeof teamWinnerMarket> | null;
  points: { maroon: number; white: number; remaining: number } | null;
  result: Result | null;
  blockers: string[];
  updatedAt: string | null;
};

/** The public read model — also the bet route's check that the market is open at these exact odds. */
export async function currentTeamWinnerState(seasonYear: number): Promise<TeamWinnerState> {
  const service = createSupabaseServiceRoleClient();
  const [{ data: snapshot, error }, { data: settlement }, latestInput] = await Promise.all([
    service.from("team_winner_odds_snapshots").select("*").eq("season_year", seasonYear).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", `team-winner:${seasonYear}`).maybeSingle(),
    latestMatchInput(service, seasonYear),
  ]);
  if (error) throw new Error(error.message);

  const empty = { seasonYear, probabilities: null, market: null, points: null, result: null, updatedAt: null };
  if (!snapshot) return { ...empty, status: settlement ? "settled" : "not_ready", result: (settlement?.winning_selection_key as Result) ?? null, blockers: ["Tiger hasn't priced Team Winner yet."] };

  const points = { maroon: Number(snapshot.maroon_points), white: Number(snapshot.white_points), remaining: Number(snapshot.points_remaining) };
  const probabilities = snapshot.maroon_win_probability === null ? null : { maroon: Number(snapshot.maroon_win_probability), tie: Number(snapshot.tie_probability), white: Number(snapshot.white_win_probability) };
  const market = probabilities ? teamWinnerMarket(seasonYear, { maroon: snapshot.maroon_american_odds, tie: snapshot.tie_american_odds, white: snapshot.white_american_odds }) : null;
  const status: TeamWinnerStatus = settlement
    ? "settled"
    : !probabilities
      ? "not_ready"
      : snapshot.decided_result
        ? "decided"
        : latestInput && (!snapshot.inputs_as_of || latestInput > snapshot.inputs_as_of)
          ? "updating"
          : "open";
  return {
    seasonYear,
    status,
    probabilities,
    market,
    points,
    result: (settlement?.winning_selection_key as Result | undefined) ?? snapshot.decided_result ?? null,
    blockers: snapshot.blockers ?? [],
    updatedAt: snapshot.created_at,
  };
}
