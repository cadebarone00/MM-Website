import { getPlayerDisplayName } from "@/lib/data/players";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isStaleSnapshot, latestMatchInput, needsRepublish, type Service } from "./futureInputs";
import { loadIndividualInputs, type IndividualInputs } from "./individualInputs";
import {
  PLAYER_BIRDIES_MODEL_VERSION,
  PLAYER_BIRDIES_SIMULATIONS,
  PLAYER_STATS,
  birdieLines,
  expectedBirdies,
  featuredLineIndex,
  playerStatMarket,
  playerStatMarketKey,
  simulatePlayerBirdies,
  type PlayerBirdiesEntry,
  type PlayerStat,
} from "./playerBirdiesFuture";
import { outcomesSoFar } from "./totalBirdiesFuture";

/** Where each per-player stat market keeps its snapshots and how it settles. */
const STORAGE: Record<PlayerStat, { table: string; settle: string }> = {
  birdies: { table: "player_birdies_odds_snapshots", settle: "settle_player_birdies_if_final" },
  doubles: { table: "player_doubles_odds_snapshots", settle: "settle_player_doubles_if_final" },
};

export async function publishPlayerStatOdds(service: Service, inputs: IndividualInputs, stat: PlayerStat) {
  const { seasonYear, players, rounds, played, history, blockers } = inputs;
  const { outcome } = PLAYER_STATS[stat];
  let holesRemaining = 0;
  for (const player of players) for (const round of rounds) for (const hole of round.holes) if (played(player, round.round, hole.hole) === null) holesRemaining += 1;

  const entries: PlayerBirdiesEntry[] | null = blockers.length || holesRemaining === 0
    ? null
    : players.map((player) => {
        const histogram = simulatePlayerBirdies({ player, rounds, history: history.get(player) ?? [], played, outcome });
        const lines = birdieLines(histogram);
        return { player, soFar: outcomesSoFar([player], rounds, played, outcome), expected: expectedBirdies(histogram), featured: featuredLineIndex(lines), lines };
      });

  const row = {
    season_year: seasonYear,
    model_version: `${PLAYER_BIRDIES_MODEL_VERSION}:${stat}`,
    players: entries,
    birdies_so_far: Object.fromEntries(players.map((player) => [player, outcomesSoFar([player], rounds, played, outcome)])),
    holes_remaining: holesRemaining,
    blockers,
    inputs_as_of: inputs.inputsAsOf,
    details: { simulations: PLAYER_BIRDIES_SIMULATIONS, rounds: rounds.map((round) => round.round), assumptions: inputs.assumptions },
  };
  const { error } = await service.from(STORAGE[stat].table).insert(row);
  if (error) throw new Error(error.message);

  if (!blockers.length && holesRemaining === 0) {
    // Settles only once every match is also closed out; a no-op otherwise.
    const { error: settleError } = await service.rpc(STORAGE[stat].settle, { p_year: seasonYear });
    if (settleError) console.error(`${PLAYER_STATS[stat].title} settlement check failed:`, settleError.message);
  }
  return row;
}

export const publishPlayerBirdiesOdds = (service: Service, inputs: IndividualInputs) => publishPlayerStatOdds(service, inputs, "birdies");

export type PlayerBirdiesStatus = "not_ready" | "open" | "updating" | "complete" | "settled";

export type PlayerBirdiesRow = PlayerBirdiesEntry & { name: string };

export type PlayerBirdiesState = {
  seasonYear: number;
  stat: PlayerStat;
  status: PlayerBirdiesStatus;
  marketKey: string;
  market: ReturnType<typeof playerStatMarket> | null;
  players: PlayerBirdiesRow[];
  /** Once every hole is in (and after settling): each player's final count. */
  finalCounts: Record<string, number> | null;
  blockers: string[];
  assumptions: string[];
  updatedAt: string | null;
};

/** The public read model and the bet route's check; `selfHeal` works as for Low Individual. */
export async function currentPlayerStatState(seasonYear: number, stat: PlayerStat, { selfHeal = false }: { selfHeal?: boolean } = {}): Promise<PlayerBirdiesState> {
  const service = createSupabaseServiceRoleClient();
  const marketKey = playerStatMarketKey(stat, seasonYear);
  const read = () =>
    Promise.all([
      service.from(STORAGE[stat].table).select("*").eq("season_year", seasonYear).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", marketKey).maybeSingle(),
      latestMatchInput(service, seasonYear),
    ]);
  let [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
  if (error) throw new Error(error.message);
  if (selfHeal && !settlement && needsRepublish(snapshot, latestInput)) {
    await publishPlayerStatOdds(service, await loadIndividualInputs(service, seasonYear), stat);
    [{ data: snapshot, error }, { data: settlement }, latestInput] = await read();
    if (error) throw new Error(error.message);
  }

  if (!snapshot) {
    return { seasonYear, stat, status: settlement ? "settled" : "not_ready", marketKey, market: null, players: [], finalCounts: null, blockers: ["Odds haven't been calculated yet."], assumptions: [], updatedAt: null };
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
    stat,
    status,
    marketKey,
    market: entries ? playerStatMarket(stat, seasonYear, entries, getPlayerDisplayName) : null,
    players: sortedEntries,
    finalCounts: holesRemaining === 0 ? snapshot.birdies_so_far ?? null : null,
    blockers,
    assumptions: snapshot.details?.assumptions ?? [],
    updatedAt: snapshot.created_at,
  };
}

export const currentPlayerBirdiesState = (seasonYear: number, options?: { selfHeal?: boolean }) => currentPlayerStatState(seasonYear, "birdies", options);
