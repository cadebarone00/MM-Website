import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { careerArchiveCourseHoles } from "@/lib/data/careerArchive.generated";
import type { CareerCourseHole } from "@/lib/data/careerStats";
import { getPlayerDisplayName, getPlayerSlug } from "@/lib/data/players";
import { calculatePreRoundAlternateShotOdds, calculatePreRoundFourballOdds, calculatePreRoundSinglesOdds, isEligibleIndividualHole, type PreRoundSinglesResult } from "@/lib/odds/preRoundSingles";
import { isTestSeason } from "@/lib/live/testSeason";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isStaleSnapshot, latestMatchInput, later, needsRepublish, pages, type Service } from "./futureInputs";
import { loadTournamentSetup } from "./loadTournamentSetup";
import type { SetupCourse } from "./tournamentSetup";
import { fieldProxyAssumption, thinPlayers, withFieldProxies } from "./fieldProxy";
import {
  TEAM_WINNER_MODEL_VERSION,
  TEAM_WINNER_SIMULATIONS,
  decidedResult,
  fairAmericanOdds,
  missingOdds,
  simulateTeamWinner,
  teamPoints,
  teamWinnerMarket,
  type FutureRound,
  type Matchup,
  type Outcome,
  type Result,
  type Roster,
} from "./teamWinnerFuture";

type Inputs = {
  rounds: FutureRound[];
  roster: Roster;
  courses: Map<string, SetupCourse>;
  blockers: string[];
  assumptions: string[];
  /** Newest match odds / official state the inputs include. */
  inputsAsOf: string | null;
};

type PairTable = { priced: Map<string, Outcome>; unpriceable: Set<string>; signatures: Map<string, string | null> };
type Archive = Awaited<ReturnType<typeof getCombinedCareerArchive>>;

/**
 * Per-matchup simulation counts. The market aggregates dozens of matchups
 * over 10,000 tournament simulations, so each needs less precision than a
 * displayed match price; this keeps a full live re-price to seconds.
 */
const PAIR_SIMULATIONS = { hole: 2_500, match: 2_500 };

/** Last resort when the model can't price a matchup (e.g. a course hole with no comparable history): evenly matched. */
const NEUTRAL_MATCHUP: Outcome = { maroon: 0.45, tie: 0.1, white: 0.45 };

/**
 * A fingerprint of the Career Archive data behind each player: eligible
 * individual-ball holes and Alternate Shot team holes (count and stroke
 * total). Any new hole (live scoring, a Tiger correction, or a submitted
 * handicap round) changes it, which marks that player's matchups for a
 * re-price.
 */
function playerSignatures(archive: Archive): Map<string, string> {
  const totals = new Map<string, { count: number; strokes: number; teamCount: number; teamStrokes: number }>();
  const entry = (player: string) => {
    let value = totals.get(player);
    if (!value) totals.set(player, (value = { count: 0, strokes: 0, teamCount: 0, teamStrokes: 0 }));
    return value;
  };
  for (const row of archive.records) {
    if (row.score <= 0 || !isEligibleIndividualHole(row)) continue;
    const value = entry(row.player);
    value.count += 1;
    value.strokes += row.score;
  }
  for (const row of archive.teamRecords) {
    if (row.score <= 0) continue;
    for (const player of [row.player1, row.player2]) {
      if (!player) continue;
      const value = entry(player);
      value.teamCount += 1;
      value.teamStrokes += row.score;
    }
  }
  return new Map([...totals].map(([player, value]) => [player, `${value.count}:${value.strokes}/${value.teamCount}:${value.teamStrokes}`]));
}

function matchupSignature(matchup: Matchup, signatures: Map<string, string>): string {
  const players = [...matchup.maroon, ...matchup.white].map(getPlayerSlug).sort();
  return [TEAM_WINNER_MODEL_VERSION, PAIR_SIMULATIONS.hole, PAIR_SIMULATIONS.match, ...players.map((player) => `${player}=${signatures.get(player) ?? "none"}`)].join("|");
}

/** Pricing runs in the background in chunks this long, under a lease so only one worker runs at a time. */
export const TEAM_WINNER_PRICING_BUDGET_MS = 40_000;
const LEASE_SECONDS = 55;
/** While matchups are pricing or re-pricing, page views start another chunk at most this often. */
const WORK_POLL_MS = 15_000;

/** Every round (Tiger's setup, else last year's), the roster, finished results, and each paired match's latest odds. */
async function loadInputs(service: Service, seasonYear: number): Promise<Inputs> {
  const [stateRows, oddsRows, snapshot] = await Promise.all([
    pages<{ match_box_id: string; status: string; official_result: Result | null; updated_at: string }>((from, to) => service.from("live_match_official_state").select("match_box_id, status, official_result, updated_at").eq("season_year", seasonYear).order("match_box_id").range(from, to)),
    pages<{ match_box_id: string; maroon_win_probability: number; tie_probability: number; white_win_probability: number; created_at: string }>((from, to) =>
      service.from("live_match_odds_snapshots").select("match_box_id, maroon_win_probability, tie_probability, white_win_probability, created_at").eq("season_year", seasonYear).order("created_at", { ascending: false }).range(from, to)),
    buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true }),
  ]);
  const setup = await loadTournamentSetup(service, seasonYear, snapshot);

  let inputsAsOf: string | null = null;
  const states = new Map(stateRows.map((row) => [row.match_box_id, row]));
  for (const row of stateRows) inputsAsOf = later(inputsAsOf, row.updated_at);
  const latestOdds = new Map<string, Outcome>();
  for (const row of oddsRows) {
    inputsAsOf = later(inputsAsOf, row.created_at);
    if (!latestOdds.has(row.match_box_id)) latestOdds.set(row.match_box_id, { maroon: Number(row.maroon_win_probability), tie: Number(row.tie_probability), white: Number(row.white_win_probability) });
  }

  const courses = new Map<string, SetupCourse>();
  const rounds: FutureRound[] = setup.rounds.map((round) => {
    courses.set(round.course.key, round.course);
    const boxes = snapshot.matchBoxes.filter((box) => box.round === round.round && box.id);
    return {
      round: round.round,
      format: round.format,
      courseKey: round.course.key,
      matches: round.matchupsLocked && boxes.length
        ? boxes.map((box) => {
            const state = states.get(box.id!);
            const result = state && (state.status === "complete" || state.status === "closed_out") ? state.official_result : null;
            return { maroon: box.maroonPlayers, white: box.whitePlayers, result, odds: result ? null : latestOdds.get(box.id!) ?? null };
          })
        : null,
    };
  });
  return { rounds, roster: setup.roster, courses, blockers: setup.blockers, assumptions: setup.assumptions, inputsAsOf };
}

async function loadPairTable(service: Service, seasonYear: number): Promise<PairTable> {
  const rows = await pages<{ pair_key: string; maroon_win_probability: number | null; tie_probability: number | null; white_win_probability: number | null; unpriceable: boolean; input_signature: string | null }>((from, to) =>
    service.from("team_winner_pair_odds").select("pair_key, maroon_win_probability, tie_probability, white_win_probability, unpriceable, input_signature").eq("season_year", seasonYear).order("pair_key").range(from, to));
  const table: PairTable = { priced: new Map(), unpriceable: new Set(), signatures: new Map() };
  for (const row of rows) {
    table.signatures.set(row.pair_key, row.input_signature);
    // Rows an earlier version marked unpriceable are treated as never priced,
    // so they're re-tried (and now fall back to even odds at worst).
    if (row.unpriceable || row.maroon_win_probability === null) continue;
    table.priced.set(row.pair_key, { maroon: Number(row.maroon_win_probability), tie: Number(row.tie_probability), white: Number(row.white_win_probability) });
  }
  return table;
}

/** One matchup through the canonical pre-round match model — the same engine live match odds use. */
function priceMatchup(matchup: Matchup, course: SetupCourse, archive: Archive, seasonYear: number): PreRoundSinglesResult | null {
  const courseHoles: CareerCourseHole[] = course.holes.map((hole) => ({ year: seasonYear, course: course.name, tee: null, hole: hole.number, par: hole.par, yards: hole.yards, holeType: `Par ${hole.par}`, holeLengthBucket: null }));
  const common = { records: archive.records, courseHoles: [...careerArchiveCourseHoles, ...courseHoles], course: course.name };
  const a = matchup.maroon.map(getPlayerSlug);
  const b = matchup.white.map(getPlayerSlug);
  if (matchup.format === "Singles") return calculatePreRoundSinglesOdds({ ...common, playerA: a[0], playerB: b[0], simulations: PAIR_SIMULATIONS });
  if (matchup.format === "Fourball") return calculatePreRoundFourballOdds({ ...common, teamA: [a[0], a[1]], teamB: [b[0], b[1]], simulations: PAIR_SIMULATIONS });
  return calculatePreRoundAlternateShotOdds({ ...common, teamRecords: archive.teamRecords, teamA: [a[0], a[1]], teamB: [b[0], b[1]], simulations: PAIR_SIMULATIONS });
}

/** Every matchup the current setup can need (unpaired rounds' possibilities plus paired matches without live odds). */
function neededMatchups(inputs: Inputs): Matchup[] {
  return inputs.blockers.length ? [] : missingOdds(inputs.rounds, inputs.roster, new Map());
}

/**
 * Work queue, most urgent first: matchups never tried (they hold the market
 * closed), then ones whose players' data has changed since they were priced
 * (the market keeps using the old price meanwhile). Needed matchups come in
 * round order, so the next round to be played re-prices first.
 */
function toPrice(inputs: Inputs, table: PairTable, signatures: Map<string, string>): Matchup[] {
  const needed = neededMatchups(inputs);
  const tried = (matchup: Matchup) => table.priced.has(matchup.key) || table.unpriceable.has(matchup.key);
  const stale = (matchup: Matchup) => tried(matchup) && table.signatures.get(matchup.key) !== matchupSignature(matchup, signatures);
  return [...needed.filter((matchup) => !tried(matchup)), ...needed.filter(stale)];
}

/**
 * Prices missing matchups until the budget runs out, saving every few so a
 * worker cut off by a server timeout loses little. Updates `table` in place.
 */
async function priceMissing(service: Service, seasonYear: number, inputs: Inputs, table: PairTable, archive: Archive, signatures: Map<string, string>, budgetMs: number) {
  const started = Date.now();
  const pending = toPrice(inputs, table, signatures);
  if (!pending.length) return;
  // Thin-history players borrow the field's scoring (see fieldProxy.ts).
  const rosterModelSlugs = [...inputs.roster.maroon, ...inputs.roster.white].map(getPlayerSlug);
  const pricingArchive = { ...archive, records: withFieldProxies(archive.records, thinPlayers(rosterModelSlugs, archive.records)) };
  let batch: Record<string, unknown>[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const { error } = await service.from("team_winner_pair_odds").upsert(batch, { onConflict: "season_year,pair_key" });
    batch = [];
    if (error) throw new Error(error.message);
  };
  for (const matchup of pending) {
    if (Date.now() - started > budgetMs) break;
    const course = inputs.courses.get(matchup.courseKey);
    const result = course ? priceMatchup(matchup, course, pricingArchive, seasonYear) : null;
    const outcome: Outcome = result && [result.a, result.tie, result.b].every(Number.isFinite) ? { maroon: result.a, tie: result.tie, white: result.b } : NEUTRAL_MATCHUP;
    const signature = matchupSignature(matchup, signatures);
    table.signatures.set(matchup.key, signature);
    table.priced.set(matchup.key, outcome);
    table.unpriceable.delete(matchup.key);
    batch.push({
      season_year: seasonYear,
      pair_key: matchup.key,
      maroon_win_probability: outcome.maroon,
      tie_probability: outcome.tie,
      white_win_probability: outcome.white,
      unpriceable: false,
      input_signature: signature,
      model_version: TEAM_WINNER_MODEL_VERSION,
      computed_at: new Date().toISOString(),
    });
    if (batch.length >= 25) await flush();
  }
  await flush();
}

/**
 * Cheap once matchups are priced: simulates the rest of the tournament and
 * publishes a snapshot. While matchups are still being priced, the snapshot
 * carries progress instead of odds.
 */
async function publish(service: Service, seasonYear: number, inputs: Inputs, table: PairTable, signatures: Map<string, string>) {
  const points = teamPoints(inputs.rounds, inputs.roster);
  const blockers = [...inputs.blockers];
  const needed = inputs.blockers.length ? [] : missingOdds(inputs.rounds, inputs.roster, table.priced);
  const failed = needed.filter((matchup) => table.unpriceable.has(matchup.key));
  const waiting = needed.length - failed.length;
  if (failed.length) {
    const players = [...new Set(failed.flatMap((matchup) => [...matchup.maroon, ...matchup.white]))];
    blockers.push(`${failed.length} possible matchups can't be priced — check Career Archive history for ${players.map(getPlayerDisplayName).join(", ")}.`);
  }
  const pricing = waiting ? { remaining: waiting } : null;
  // Priced with older data and queued for a re-price; the old price is used meanwhile.
  const updating = neededMatchups(inputs).filter((matchup) => table.priced.has(matchup.key) && table.signatures.get(matchup.key) !== matchupSignature(matchup, signatures)).length;

  const decided = blockers.length || pricing ? null : decidedResult(points);
  const outcome: Outcome | null = blockers.length || pricing
    ? null
    : decided
      ? { maroon: decided === "maroon" ? 1 : 0, tie: decided === "tie" ? 1 : 0, white: decided === "white" ? 1 : 0 }
      : simulateTeamWinner({ rounds: inputs.rounds, roster: inputs.roster, pairTable: table.priced });

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
      assumptions: inputs.assumptions,
      pricing: pricing ? { remaining: pricing.remaining, priced: neededMatchups(inputs).length - needed.length } : null,
      updating,
      rounds: inputs.rounds.map((round) => ({ round: round.round, format: round.format, paired: round.matches !== null })),
    },
  };
  const { error } = await service.from("team_winner_odds_snapshots").insert(row);
  if (error) throw new Error(error.message);
  return row;
}

/**
 * Refreshes Team Winner. With a pricing budget it first prices never-tried
 * matchups and re-prices ones whose players' Career Archive data changed,
 * but only if it wins the lease, so concurrent triggers don't duplicate the
 * work. Never throws: a refresh must not fail the hole submission, match
 * publication, or page view that triggered it. Pass `archive` to reuse one
 * already loaded for this refresh.
 */
export async function refreshTeamWinnerOdds(seasonYear: number, { pricingBudgetMs = 0, archive }: { pricingBudgetMs?: number; archive?: Archive } = {}) {
  try {
    const service = createSupabaseServiceRoleClient();
    const [inputs, table, loadedArchive] = await Promise.all([
      loadInputs(service, seasonYear),
      loadPairTable(service, seasonYear),
      archive ?? getCombinedCareerArchive({ includeTestSeason: isTestSeason(seasonYear) }),
    ]);
    const signatures = playerSignatures(loadedArchive);
    const thin = thinPlayers([...inputs.roster.maroon, ...inputs.roster.white].map(getPlayerSlug), loadedArchive.records);
    const thinNote = fieldProxyAssumption([...inputs.roster.maroon, ...inputs.roster.white].filter((player) => thin.includes(getPlayerSlug(player))));
    if (thinNote) inputs.assumptions.push(thinNote);
    if (pricingBudgetMs && toPrice(inputs, table, signatures).length) {
      const { data: claimed, error } = await service.rpc("claim_team_winner_pricing", { p_year: seasonYear, p_seconds: LEASE_SECONDS });
      if (error) throw new Error(error.message);
      if (claimed) {
        try {
          await priceMissing(service, seasonYear, inputs, table, loadedArchive, signatures, pricingBudgetMs);
        } finally {
          // Release early so the next trigger can start the next chunk right away.
          await service.from("team_winner_pricing_lease").update({ locked_until: new Date().toISOString() }).eq("season_year", seasonYear);
        }
      }
    }
    await publish(service, seasonYear, inputs, table, signatures);
  } catch (error) {
    console.error("Team Winner odds refresh failed:", error);
  }
}

export type TeamWinnerStatus = "not_ready" | "pricing" | "open" | "updating" | "decided" | "settled";

export type TeamWinnerState = {
  seasonYear: number;
  status: TeamWinnerStatus;
  probabilities: Outcome | null;
  market: ReturnType<typeof teamWinnerMarket> | null;
  points: { maroon: number; white: number; remaining: number } | null;
  result: Result | null;
  blockers: string[];
  assumptions: string[];
  /** While matchups are being priced for the first time. */
  pricing: { priced: number; remaining: number } | null;
  /** Matchups being re-priced with the latest scores (the market stays open on their previous prices). */
  updatingMatchups: number;
  updatedAt: string | null;
  /** Whether a background refresh should run (missing, old, stale, or still pricing). */
  needsRefresh: boolean;
};

/** The public read model — also the bet route's check that the market is open at these exact odds. */
export async function currentTeamWinnerState(seasonYear: number): Promise<TeamWinnerState> {
  const service = createSupabaseServiceRoleClient();
  const [{ data: snapshot, error }, { data: settlement }, latestInput, { data: lease }] = await Promise.all([
    service.from("team_winner_odds_snapshots").select("*").eq("season_year", seasonYear).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", `team-winner:${seasonYear}`).maybeSingle(),
    latestMatchInput(service, seasonYear),
    service.from("team_winner_pricing_lease").select("locked_until").eq("season_year", seasonYear).maybeSingle(),
  ]);
  // Pricing work in flight, or finished moments ago: don't pile on another refresh.
  const workerBusy = Boolean(lease && new Date(lease.locked_until).getTime() > Date.now());
  if (error) throw new Error(error.message);

  const settledResult = (settlement?.winning_selection_key as Result | undefined) ?? null;
  if (!snapshot) {
    return { seasonYear, status: settlement ? "settled" : "pricing", probabilities: null, market: null, points: null, result: settledResult, blockers: [], assumptions: [], pricing: { priced: 0, remaining: 0 }, updatingMatchups: 0, updatedAt: null, needsRefresh: !settlement && !workerBusy };
  }

  const points = { maroon: Number(snapshot.maroon_points), white: Number(snapshot.white_points), remaining: Number(snapshot.points_remaining) };
  const probabilities = snapshot.maroon_win_probability === null ? null : { maroon: Number(snapshot.maroon_win_probability), tie: Number(snapshot.tie_probability), white: Number(snapshot.white_win_probability) };
  const market = probabilities ? teamWinnerMarket(seasonYear, { maroon: snapshot.maroon_american_odds, tie: snapshot.tie_american_odds, white: snapshot.white_american_odds }) : null;
  const pricing: { priced: number; remaining: number } | null = snapshot.details?.pricing ?? null;
  const updatingMatchups = Number(snapshot.details?.updating ?? 0);
  const blockers: string[] = snapshot.blockers ?? [];
  const status: TeamWinnerStatus = settlement
    ? "settled"
    : blockers.length
      ? "not_ready"
      : pricing
        ? "pricing"
        : !probabilities
          ? "not_ready"
          : snapshot.decided_result
            ? "decided"
            : isStaleSnapshot(snapshot, latestInput)
              ? "updating"
              : "open";
  return {
    seasonYear,
    status,
    probabilities,
    market,
    points,
    result: settledResult ?? snapshot.decided_result ?? null,
    blockers,
    assumptions: snapshot.details?.assumptions ?? [],
    pricing,
    updatingMatchups,
    updatedAt: snapshot.created_at,
    needsRefresh: !settlement && !workerBusy && (((Boolean(pricing) || updatingMatchups > 0) && Date.now() - new Date(snapshot.created_at).getTime() > WORK_POLL_MS) || needsRepublish(snapshot, latestInput)),
  };
}
