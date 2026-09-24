import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isStaleSnapshot, latestMatchInput, needsRepublish, type Service } from "./futureInputs";
import { loadIndividualInputs, type IndividualInputs } from "./individualInputs";
import {
  TOTAL_BIRDIES_MODEL_VERSION,
  TOTAL_BIRDIES_SIMULATIONS,
  birdiesSoFar,
  featuredLine,
  simulateTotalBirdies,
  totalBirdiesMarket,
  totalBirdiesMarketKey,
} from "./totalBirdiesFuture";

export async function publishTotalBirdiesOdds(service: Service, inputs: IndividualInputs) {
  const { seasonYear, players, rounds, played, history, blockers } = inputs;
  const soFar = birdiesSoFar(players, rounds, played);
  let holesRemaining = 0;
  for (const player of players) for (const round of rounds) for (const hole of round.holes) if (played(player, round.round, hole.hole) === null) holesRemaining += 1;

  const line = blockers.length || holesRemaining === 0 ? null : featuredLine(simulateTotalBirdies({ players, rounds, history, played }));
  const row = {
    season_year: seasonYear,
    model_version: TOTAL_BIRDIES_MODEL_VERSION,
    line: line?.line ?? null,
    over_probability: line?.over ?? null,
    under_probability: line?.under ?? null,
    expected_total: line?.mean ?? null,
    birdies_so_far: soFar,
    holes_remaining: holesRemaining,
    blockers,
    inputs_as_of: inputs.inputsAsOf,
    details: { simulations: TOTAL_BIRDIES_SIMULATIONS, rounds: rounds.map((round) => round.round), assumptions: inputs.assumptions },
  };
  const { error } = await service.from("total_birdies_odds_snapshots").insert(row);
  if (error) throw new Error(error.message);

  if (!blockers.length && holesRemaining === 0) {
    // Settles only once every match is also closed out; a no-op otherwise.
    const { error: settleError } = await service.rpc("settle_total_birdies_if_final", { p_year: seasonYear });
    if (settleError) console.error("Total Birdies settlement check failed:", settleError.message);
  }
  return row;
}

export type TotalBirdiesStatus = "not_ready" | "open" | "updating" | "complete" | "settled";

export type TotalBirdiesState = {
  seasonYear: number;
  status: TotalBirdiesStatus;
  marketKey: string;
  market: ReturnType<typeof totalBirdiesMarket> | null;
  line: number | null;
  over: number | null;
  under: number | null;
  expectedTotal: number | null;
  birdiesSoFar: number;
  holesRemaining: number;
  finalTotal: number | null;
  blockers: string[];
  /** Defaults taken from last year's setup. */
  assumptions: string[];
  updatedAt: string | null;
};

/** The public read model and the bet route's check; `selfHeal` works as for Low Individual. */
export async function currentTotalBirdiesState(seasonYear: number, { selfHeal = false }: { selfHeal?: boolean } = {}): Promise<TotalBirdiesState> {
  const service = createSupabaseServiceRoleClient();
  const marketKey = totalBirdiesMarketKey(seasonYear);
  const read = () =>
    Promise.all([
      service.from("total_birdies_odds_snapshots").select("*").eq("season_year", seasonYear).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", marketKey).maybeSingle(),
      latestMatchInput(service, seasonYear),
    ]);
  let [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
  if (error) throw new Error(error.message);
  if (selfHeal && !settlement && needsRepublish(snapshot, latestInput)) {
    await publishTotalBirdiesOdds(service, await loadIndividualInputs(service, seasonYear));
    [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
    if (error) throw new Error(error.message);
  }

  // Settlement records the final field total as "total:<n>".
  const finalTotal = settlement ? Number(String(settlement.winning_selection_key).replace("total:", "")) : null;
  if (!snapshot) {
    return { seasonYear, status: settlement ? "settled" : "not_ready", marketKey, market: null, line: null, over: null, under: null, expectedTotal: null, birdiesSoFar: 0, holesRemaining: 0, finalTotal, blockers: ["Odds haven't been calculated yet."], assumptions: [], updatedAt: null };
  }

  const line = snapshot.line === null ? null : Number(snapshot.line);
  const over = snapshot.over_probability === null ? null : Number(snapshot.over_probability);
  const under = snapshot.under_probability === null ? null : Number(snapshot.under_probability);
  const holesRemaining = Number(snapshot.holes_remaining);
  const blockers: string[] = snapshot.blockers ?? [];
  const status: TotalBirdiesStatus = settlement
    ? "settled"
    : blockers.length
      ? "not_ready"
      : holesRemaining === 0
        ? "complete"
        : isStaleSnapshot(snapshot, latestInput)
          ? "updating"
          : "open";
  return {
    seasonYear,
    status,
    marketKey,
    market: line !== null && over !== null && under !== null ? totalBirdiesMarket(seasonYear, { line, over, under, mean: Number(snapshot.expected_total) }) : null,
    line,
    over,
    under,
    expectedTotal: snapshot.expected_total === null ? null : Number(snapshot.expected_total),
    birdiesSoFar: Number(snapshot.birdies_so_far),
    holesRemaining,
    finalTotal,
    blockers,
    assumptions: snapshot.details?.assumptions ?? [],
    updatedAt: snapshot.created_at,
  };
}
