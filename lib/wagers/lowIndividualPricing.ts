import { getPlayerDisplayName } from "@/lib/data/players";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { latestMatchInput, type Service } from "./futureInputs";
import { isStaleSnapshot, loadIndividualInputs, needsRepublish, type IndividualInputs } from "./individualInputs";
import {
  LOW_INDIVIDUAL_MODEL_VERSION,
  LOW_INDIVIDUAL_SIMULATIONS,
  currentStandings,
  lowIndividualMarket,
  lowIndividualMarketKey,
  lowIndividualOdds,
  simulateLowIndividual,
  type Standing,
} from "./lowIndividualFuture";

export async function publishLowIndividualOdds(service: Service, inputs: IndividualInputs) {
  const { seasonYear, players, rounds, played, history, blockers } = inputs;
  const standings = currentStandings(players, rounds, played);
  const holesRemaining = standings.reduce((sum, standing) => sum + standing.holesTotal - standing.holesPlayed, 0);
  let probabilities: Record<string, number> | null = null;
  if (!blockers.length) {
    if (holesRemaining === 0) {
      // Every hole is in: the result is known, betting is closed, settlement pending closeout.
      const best = Math.min(...standings.map((standing) => standing.strokes));
      const winners = standings.filter((standing) => standing.strokes === best);
      probabilities = Object.fromEntries(players.map((player) => [player, winners.some((w) => w.player === player) ? 1 / winners.length : 0]));
    } else {
      probabilities = simulateLowIndividual({ players, rounds, history, played });
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
    inputs_as_of: inputs.inputsAsOf,
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

  if (selfHeal && !settlement && needsRepublish(snapshot, latestInput)) {
    await publishLowIndividualOdds(service, await loadIndividualInputs(service, seasonYear));
    [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
    if (error) throw new Error(error.message);
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
        : isStaleSnapshot(snapshot, latestInput)
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
