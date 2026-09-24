import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getPlayerDisplayName } from "@/lib/data/players";
import { scoreKey } from "@/lib/live/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadTournamentSetup } from "./loadTournamentSetup";
import {
  ACE_PROBABILITY_PER_TEE_SHOT,
  holeInOneMarket,
  holeInOneMarketKey,
  holeInOneProbability,
  teeShotsRemaining,
  type AceRound,
  type HolePlayed,
} from "./holeInOneFuture";

export type HoleInOneStatus = "not_ready" | "open" | "ace" | "closed" | "settled";

export type HoleInOneState = {
  seasonYear: number;
  status: HoleInOneStatus;
  marketKey: string;
  market: ReturnType<typeof holeInOneMarket> | null;
  probability: number | null;
  perShot: number;
  teeShotsRemaining: number;
  aces: { player: string; name: string; round: number; hole: number }[];
  result: "yes" | "no" | null;
  blockers: string[];
  /** Defaults taken from last year's setup. */
  assumptions: string[];
};

/**
 * Computed fresh on every read — the formula is instant, so there's no
 * snapshot to go stale. The bet route uses this same read, so a bet always
 * gets the current price.
 */
export async function currentHoleInOneState(seasonYear: number): Promise<HoleInOneState> {
  const service = createSupabaseServiceRoleClient();
  const marketKey = holeInOneMarketKey(seasonYear);
  const [{ data: settlement }, snapshot] = await Promise.all([
    service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", marketKey).maybeSingle(),
    buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true }),
  ]);
  const setup = await loadTournamentSetup(service, seasonYear, snapshot);
  const players = [...setup.roster.maroon, ...setup.roster.white].sort();
  const blockers = setup.blockers;
  const rounds: AceRound[] = setup.rounds.map((round) => ({ round: round.round, format: round.format, par3Holes: round.course.holes.filter((hole) => hole.par === 3).map((hole) => hole.number) }));

  const hasScore = (player: string, round: number, hole: number) => (snapshot.scores.get(scoreKey(player, round, hole))?.score ?? 0) > 0;
  // In Foursome a pair shares one ball, so a hole is played for both partners
  // once either has a score.
  const partners = new Map<string, string[]>();
  for (const box of snapshot.matchBoxes) {
    if (box.format !== "Foursome") continue;
    for (const side of [box.maroonPlayers, box.whitePlayers]) for (const player of side) partners.set(`${box.round}:${player}`, side);
  }
  const played: HolePlayed = (player, round, hole) => (partners.get(`${round}:${player}`) ?? [player]).some((member) => hasScore(member, round, hole));

  const aces = [...snapshot.scores.values()]
    .filter((score) => score.score === 1)
    .map((score) => ({ player: score.player, name: getPlayerDisplayName(score.player), round: score.round, hole: score.hole }))
    .sort((a, b) => a.round - b.round || a.hole - b.hole);
  const shots = teeShotsRemaining(rounds, players, played);
  const ready = !blockers.length;
  const probability = !ready ? null : aces.length ? 1 : holeInOneProbability(shots);
  const result = settlement ? (settlement.winning_selection_key as "yes" | "no") : aces.length ? "yes" : ready && shots === 0 ? "no" : null;
  const status: HoleInOneStatus = settlement ? "settled" : !ready ? "not_ready" : aces.length ? "ace" : shots === 0 ? "closed" : "open";

  return {
    seasonYear,
    status,
    marketKey,
    market: probability === null ? null : holeInOneMarket(seasonYear, probability),
    probability,
    perShot: ACE_PROBABILITY_PER_TEE_SHOT,
    teeShotsRemaining: shots,
    aces,
    result,
    blockers,
    assumptions: setup.assumptions,
  };
}
