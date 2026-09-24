import { getPlayerDisplayName } from "@/lib/data/players";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isStaleSnapshot, latestMatchInput, needsRepublish, type Service } from "./futureInputs";
import { loadIndividualInputs, type IndividualInputs } from "./individualInputs";
import {
  PLAYER_BIRDIES_MODEL_VERSION,
  PLAYER_BIRDIES_SIMULATIONS,
  birdieLines,
  expectedBirdies,
  featuredLineIndex,
  playerBirdiesMarket,
  playerBirdiesMarketKey,
  simulatePlayerBirdies,
  type PlayerBirdiesEntry,
} from "./playerBirdiesFuture";
import { birdiesSoFar } from "./totalBirdiesFuture";

export async function publishPlayerBirdiesOdds(service: Service, inputs: IndividualInputs) {
  const { seasonYear, players, rounds, played, history, blockers } = inputs;
  let holesRemaining = 0;
  for (const player of players) for (const round of rounds) for (const hole of round.holes) if (played(player, round.round, hole.hole) === null) holesRemaining += 1;

  const entries: PlayerBirdiesEntry[] | null = blockers.length || holesRemaining === 0
    ? null
    : players.map((player) => {
        const histogram = simulatePlayerBirdies({ player, rounds, history: history.get(player) ?? [], played });
        const lines = birdieLines(histogram);
        return { player, birdiesSoFar: birdiesSoFar([player], rounds, played), expected: expectedBirdies(histogram), featured: featuredLineIndex(lines), lines };
      });

  const row = {
    season_year: seasonYear,
    model_version: PLAYER_BIRDIES_MODEL_VERSION,
    players: entries,
    birdies_so_far: Object.fromEntries(players.map((player) => [player, birdiesSoFar([player], rounds, played)])),
    holes_remaining: holesRemaining,
    blockers,
    inputs_as_of: inputs.inputsAsOf,
    details: { simulations: PLAYER_BIRDIES_SIMULATIONS, rounds: rounds.map((round) => round.round), assumptions: inputs.assumptions },
  };
  const { error } = await service.from("player_birdies_odds_snapshots").insert(row);
  if (error) throw new Error(error.message);

  if (!blockers.length && holesRemaining === 0) {
    // Settles only once every match is also closed out; a no-op otherwise.
    const { error: settleError } = await service.rpc("settle_player_birdies_if_final", { p_year: seasonYear });
    if (settleError) console.error("Player Birdies settlement check failed:", settleError.message);
  }
  return row;
}

export type PlayerBirdiesStatus = "not_ready" | "open" | "updating" | "complete" | "settled";

export type PlayerBirdiesRow = PlayerBirdiesEntry & { name: string };

export type PlayerBirdiesState = {
  seasonYear: number;
  status: PlayerBirdiesStatus;
  marketKey: string;
  market: ReturnType<typeof playerBirdiesMarket> | null;
  players: PlayerBirdiesRow[];
  /** Once every hole is in (and after settling): each player's final count. */
  finalBirdies: Record<string, number> | null;
  blockers: string[];
  assumptions: string[];
  updatedAt: string | null;
};

/** The public read model and the bet route's check; `selfHeal` works as for Low Individual. */
export async function currentPlayerBirdiesState(seasonYear: number, { selfHeal = false }: { selfHeal?: boolean } = {}): Promise<PlayerBirdiesState> {
  const service = createSupabaseServiceRoleClient();
  const marketKey = playerBirdiesMarketKey(seasonYear);
  const read = () =>
    Promise.all([
      service.from("player_birdies_odds_snapshots").select("*").eq("season_year", seasonYear).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", marketKey).maybeSingle(),
      latestMatchInput(service, seasonYear),
    ]);
  let [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
  if (error) throw new Error(error.message);
  if (selfHeal && !settlement && needsRepublish(snapshot, latestInput)) {
    await publishPlayerBirdiesOdds(service, await loadIndividualInputs(service, seasonYear));
    [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
    if (error) throw new Error(error.message);
  }

  if (!snapshot) {
    return { seasonYear, status: settlement ? "settled" : "not_ready", marketKey, market: null, players: [], finalBirdies: null, blockers: ["Odds haven't been calculated yet."], assumptions: [], updatedAt: null };
  }

  const entries: PlayerBirdiesEntry[] | null = snapshot.players ?? null;
  const holesRemaining = Number(snapshot.holes_remaining);
  const blockers: string[] = snapshot.blockers ?? [];
  const status: PlayerBirdiesStatus = settlement
    ? "settled"
    : blockers.length
      ? "not_ready"
      : holesRemaining === 0
        ? "complete"
        : isStaleSnapshot(snapshot, latestInput)
          ? "updating"
          : "open";
  const sortedEntries = (entries ?? []).map((entry) => ({ ...entry, name: getPlayerDisplayName(entry.player) })).sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name));
  return {
    seasonYear,
    status,
    marketKey,
    market: entries ? playerBirdiesMarket(seasonYear, entries, getPlayerDisplayName) : null,
    players: sortedEntries,
    finalBirdies: holesRemaining === 0 ? snapshot.birdies_so_far ?? null : null,
    blockers,
    assumptions: snapshot.details?.assumptions ?? [],
    updatedAt: snapshot.created_at,
  };
}
