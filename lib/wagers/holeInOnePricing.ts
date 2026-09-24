import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getPlayerDisplayName } from "@/lib/data/players";
import { scoreKey } from "@/lib/live/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { pages } from "./futureInputs";
import {
  ACE_PROBABILITY_PER_TEE_SHOT,
  holeInOneMarket,
  holeInOneMarketKey,
  holeInOneProbability,
  teeShotsRemaining,
  type AceRound,
  type HolePlayed,
} from "./holeInOneFuture";

const FORMATS = new Set(["Singles", "Fourball", "Foursome"]);

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
};

/**
 * Computed fresh on every read — the formula is instant, so there's no
 * snapshot to go stale. The bet route uses this same read, so a bet always
 * gets the current price.
 */
export async function currentHoleInOneState(seasonYear: number): Promise<HoleInOneState> {
  const service = createSupabaseServiceRoleClient();
  const marketKey = holeInOneMarketKey(seasonYear);
  const [{ data: settings, error: settingsError }, roundRows, { data: settlement }, snapshot] = await Promise.all([
    service.from("live_tournament_settings").select("round_count").eq("season_year", seasonYear).maybeSingle(),
    pages<{ round: number; format: string | null }>((from, to) => service.from("live_round_state").select("round, format").eq("season_year", seasonYear).order("round").range(from, to)),
    service.from("wagers_market_settlements").select("winning_selection_key").eq("market_key", marketKey).maybeSingle(),
    buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true }),
  ]);
  if (settingsError) throw new Error(settingsError.message);

  const players = Object.keys(snapshot.players).sort();
  const blockers: string[] = [];
  const roundCount = settings?.round_count ?? null;
  if (!roundCount) blockers.push("Tiger hasn't set the number of rounds yet.");
  if (!players.length) blockers.push("Both team rosters need to be set.");

  const rounds: AceRound[] = [];
  for (let number = 1; number <= (roundCount ?? 0); number += 1) {
    const format = roundRows.find((row) => row.round === number)?.format;
    if (!format || !FORMATS.has(format)) { blockers.push(`Round ${number} needs a format.`); continue; }
    const course = snapshot.courses[snapshot.roundCourses[number]];
    if (!course) { blockers.push(`Round ${number} needs a course.`); continue; }
    rounds.push({ round: number, format: format as AceRound["format"], par3Holes: course.holes.filter((hole) => hole.par === 3).map((hole) => hole.number) });
  }

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
  };
}
