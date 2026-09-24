import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { getPlayerDisplayName, getPlayerSlug } from "@/lib/data/players";
import { isEligibleIndividualHole } from "@/lib/odds/preRoundSingles";
import { isTestSeason } from "@/lib/live/testSeason";
import { scoreKey } from "@/lib/live/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { latestMatchInput, pages, type Service } from "./futureInputs";
import {
  LOW_INDIVIDUAL_MODEL_VERSION,
  LOW_INDIVIDUAL_SIMULATIONS,
  currentStandings,
  lowIndividualMarket,
  lowIndividualMarketKey,
  lowIndividualOdds,
  missingHistory,
  simulateLowIndividual,
  type HistoryRow,
  type IndividualRound,
  type PlayedScore,
  type Standing,
} from "./lowIndividualFuture";

const INDIVIDUAL_FORMATS = new Set(["Singles", "Fourball"]);
/** Pre-tournament nothing publishes match odds, so the public read reprices on this cadence. */
const MAX_SNAPSHOT_AGE_MS = 10 * 60 * 1000;
/** If a score landed but no refresh followed it, the public read self-heals after this long. */
const STALE_GRACE_MS = 30 * 1000;

async function publishLowIndividualOdds(service: Service, seasonYear: number) {
  const [{ data: settings, error: settingsError }, roundRows, inputsAsOf, snapshot] = await Promise.all([
    service.from("live_tournament_settings").select("round_count").eq("season_year", seasonYear).maybeSingle(),
    pages<{ round: number; format: string | null }>((from, to) => service.from("live_round_state").select("round, format").eq("season_year", seasonYear).order("round").range(from, to)),
    latestMatchInput(service, seasonYear),
    buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true }),
  ]);
  if (settingsError) throw new Error(settingsError.message);

  const players = Object.keys(snapshot.players).sort();
  const blockers: string[] = [];
  const roundCount = settings?.round_count ?? null;
  if (!roundCount) blockers.push("Tiger hasn't set the number of rounds yet.");
  if (!players.length) blockers.push("Both team rosters need to be set.");

  const rounds: IndividualRound[] = [];
  for (let number = 1; number <= (roundCount ?? 0); number += 1) {
    const format = roundRows.find((row) => row.round === number)?.format;
    if (!format) { blockers.push(`Round ${number} needs a format.`); continue; }
    if (!INDIVIDUAL_FORMATS.has(format)) continue; // Foursome rounds don't count toward individual strokes.
    const course = snapshot.courses[snapshot.roundCourses[number]];
    if (!course) { blockers.push(`Round ${number} needs a course.`); continue; }
    rounds.push({ round: number, holes: course.holes.map((hole) => ({ hole: hole.number, par: hole.par, yards: hole.yards })) });
  }
  if (roundCount && !blockers.length && !rounds.length) blockers.push("No Singles or Fourball rounds are scheduled.");

  const played: PlayedScore = (player, round, hole) => {
    const score = snapshot.scores.get(scoreKey(player, round, hole))?.score;
    return score && score > 0 ? score : null;
  };

  const standings = currentStandings(players, rounds, played);
  const holesRemaining = standings.reduce((sum, standing) => sum + standing.holesTotal - standing.holesPlayed, 0);
  let probabilities: Record<string, number> | null = null;
  if (!blockers.length) {
    const archive = await getCombinedCareerArchive({ includeTestSeason: isTestSeason(seasonYear) });
    const history = new Map<string, HistoryRow[]>();
    for (const row of archive.records) {
      if (row.score <= 0 || !isEligibleIndividualHole(row)) continue;
      const list = history.get(row.player) ?? [];
      list.push({ score: row.score, par: row.par, yards: row.yards });
      history.set(row.player, list);
    }
    // Career Archive rows are keyed by model slug; roster rows by player slug.
    const modelHistory = new Map(players.map((player) => [player, history.get(getPlayerSlug(player)) ?? []]));
    const missing = missingHistory(players, rounds, modelHistory, played);
    const missingPlayers = [...new Set(missing.map((entry) => entry.split(":")[0]))];
    if (missingPlayers.length) {
      blockers.push(...missingPlayers.map((player) => `${getPlayerDisplayName(player)} doesn't have enough Career Archive history to price.`));
    } else if (holesRemaining === 0) {
      // Every hole is in: the result is known, betting is closed, settlement pending closeout.
      const best = Math.min(...standings.map((standing) => standing.strokes));
      const winners = standings.filter((standing) => standing.strokes === best);
      probabilities = Object.fromEntries(players.map((player) => [player, winners.some((w) => w.player === player) ? 1 / winners.length : 0]));
    } else {
      probabilities = simulateLowIndividual({ players, rounds, history: modelHistory, played });
    }
  }

  const row = {
    season_year: seasonYear,
    model_version: LOW_INDIVIDUAL_MODEL_VERSION,
    probabilities,
    american_odds: probabilities ? lowIndividualOdds(probabilities) : null,
    standings,
    holes_remaining: holesRemaining,
    blockers,
    inputs_as_of: inputsAsOf,
    details: { simulations: LOW_INDIVIDUAL_SIMULATIONS, rounds: rounds.map((round) => round.round) },
  };
  const { error } = await service.from("low_individual_odds_snapshots").insert(row);
  if (error) throw new Error(error.message);

  if (probabilities && holesRemaining === 0) {
    // Settles only once every match is also closed out; a no-op otherwise.
    const { error: settleError } = await service.rpc("settle_low_individual_if_final", { p_year: seasonYear });
    if (settleError) console.error("Low Individual settlement check failed:", settleError.message);
  }
  return row;
}

/** Never lets a Low Individual refresh fail the match publication that triggered it. */
export async function refreshLowIndividualOdds(seasonYear: number) {
  try {
    await publishLowIndividualOdds(createSupabaseServiceRoleClient(), seasonYear);
  } catch (error) {
    console.error("Low Individual odds refresh failed:", error);
  }
}

export type LowIndividualStatus = "not_ready" | "open" | "updating" | "complete" | "settled";

export type LowIndividualEntry = Standing & { name: string; probability: number; odds: number | null };

export type LowIndividualState = {
  seasonYear: number;
  status: LowIndividualStatus;
  marketKey: string;
  market: ReturnType<typeof lowIndividualMarket> | null;
  entries: LowIndividualEntry[];
  started: boolean;
  winners: string[];
  blockers: string[];
  updatedAt: string | null;
};

/**
 * The public read model and the bet route's check. With `selfHeal`, a
 * missing, old, or stale snapshot is recomputed first — needed because
 * before the tournament no score publication ever triggers a refresh.
 */
export async function currentLowIndividualState(seasonYear: number, { selfHeal = false }: { selfHeal?: boolean } = {}): Promise<LowIndividualState> {
  const service = createSupabaseServiceRoleClient();
  const marketKey = lowIndividualMarketKey(seasonYear);
  const read = () =>
    Promise.all([
      service.from("low_individual_odds_snapshots").select("*").eq("season_year", seasonYear).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", marketKey).maybeSingle(),
      latestMatchInput(service, seasonYear),
    ]);
  let [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
  if (error) throw new Error(error.message);

  const isStale = (row: typeof snapshot) => Boolean(latestInput && (!row?.inputs_as_of || latestInput > row.inputs_as_of));
  if (selfHeal && !settlement) {
    const age = snapshot ? Date.now() - new Date(snapshot.created_at).getTime() : Infinity;
    const staleTooLong = isStale(snapshot) && latestInput !== null && Date.now() - new Date(latestInput).getTime() > STALE_GRACE_MS;
    if (age > MAX_SNAPSHOT_AGE_MS || staleTooLong) {
      await publishLowIndividualOdds(service, seasonYear);
      [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
      if (error) throw new Error(error.message);
    }
  }

  const winners = settlement ? String(settlement.winning_selection_key).split(",") : [];
  if (!snapshot) {
    return { seasonYear, status: settlement ? "settled" : "not_ready", marketKey, market: null, entries: [], started: false, winners, blockers: ["Odds haven't been calculated yet."], updatedAt: null };
  }

  const probabilities: Record<string, number> | null = snapshot.probabilities ?? null;
  const odds: Record<string, number | null> = snapshot.american_odds ?? {};
  const standings: Standing[] = snapshot.standings ?? [];
  const entries: LowIndividualEntry[] = standings
    .map((standing) => ({ ...standing, name: getPlayerDisplayName(standing.player), probability: probabilities?.[standing.player] ?? 0, odds: odds[standing.player] ?? null }))
    .sort((a, b) => b.probability - a.probability || a.toPar - b.toPar);
  const status: LowIndividualStatus = settlement
    ? "settled"
    : !probabilities
      ? "not_ready"
      : Number(snapshot.holes_remaining) === 0
        ? "complete"
        : isStale(snapshot)
          ? "updating"
          : "open";
  return {
    seasonYear,
    status,
    marketKey,
    market: probabilities ? lowIndividualMarket(seasonYear, odds, getPlayerDisplayName) : null,
    entries,
    started: standings.some((standing) => standing.holesPlayed > 0),
    winners,
    blockers: snapshot.blockers ?? [],
    updatedAt: snapshot.created_at,
  };
}
