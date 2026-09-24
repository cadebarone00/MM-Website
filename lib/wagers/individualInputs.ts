import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { getPlayerDisplayName, getPlayerSlug } from "@/lib/data/players";
import { isEligibleIndividualHole } from "@/lib/odds/preRoundSingles";
import { isTestSeason } from "@/lib/live/testSeason";
import { scoreKey } from "@/lib/live/types";
import { latestMatchInput, type Service } from "./futureInputs";
import { loadTournamentSetup } from "./loadTournamentSetup";
import { missingHistory, type HistoryRow, type IndividualRound, type PlayedScore } from "./lowIndividualFuture";

/**
 * Shared inputs for the individual-ball futures (Low Individual, Total
 * Birdies): the field, every Singles/Fourball round's course setup,
 * confirmed live scores, and each player's eligible Career Archive holes.
 * Loaded once per refresh and handed to each market's publisher.
 */
export type IndividualInputs = {
  seasonYear: number;
  players: string[];
  rounds: IndividualRound[];
  played: PlayedScore;
  /** Keyed by roster player slug. Empty when blockers stop pricing. */
  history: Map<string, HistoryRow[]>;
  /** Why odds can't be published yet; empty when ready. */
  blockers: string[];
  /** Defaults taken from last year's setup (see tournamentSetup.ts). */
  assumptions: string[];
  inputsAsOf: string | null;
};

type Archive = Awaited<ReturnType<typeof getCombinedCareerArchive>>;

/** Pass `archive` to reuse one already loaded for this refresh. */
export async function loadIndividualInputs(service: Service, seasonYear: number, archive?: Archive): Promise<IndividualInputs> {
  const [inputsAsOf, snapshot] = await Promise.all([latestMatchInput(service, seasonYear), buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true })]);
  const setup = await loadTournamentSetup(service, seasonYear, snapshot);
  const players = [...setup.roster.maroon, ...setup.roster.white].sort();
  const blockers = [...setup.blockers];
  // Foursome rounds produce no individual scores.
  const rounds: IndividualRound[] = setup.rounds
    .filter((round) => round.format !== "Foursome")
    .map((round) => ({ round: round.round, holes: round.course.holes.map((hole) => ({ hole: hole.number, par: hole.par, yards: hole.yards })) }));
  if (!blockers.length && !rounds.length) blockers.push("No Singles or Fourball rounds are scheduled.");

  const played: PlayedScore = (player, round, hole) => {
    const score = snapshot.scores.get(scoreKey(player, round, hole))?.score;
    return score && score > 0 ? score : null;
  };

  const history = new Map<string, HistoryRow[]>();
  if (!blockers.length) {
    const records = (archive ?? (await getCombinedCareerArchive({ includeTestSeason: isTestSeason(seasonYear) }))).records;
    const byModelSlug = new Map<string, HistoryRow[]>();
    for (const row of records) {
      if (row.score <= 0 || !isEligibleIndividualHole(row)) continue;
      const list = byModelSlug.get(row.player) ?? [];
      list.push({ score: row.score, par: row.par, yards: row.yards });
      byModelSlug.set(row.player, list);
    }
    // Career Archive rows are keyed by model slug; roster rows by player slug.
    for (const player of players) history.set(player, byModelSlug.get(getPlayerSlug(player)) ?? []);
    const missingPlayers = [...new Set(missingHistory(players, rounds, history, played).map((entry) => entry.split(":")[0]))];
    blockers.push(...missingPlayers.map((player) => `${getPlayerDisplayName(player)} doesn't have enough Career Archive history to price.`));
  }

  return { seasonYear, players, rounds, played, history, blockers, assumptions: setup.assumptions, inputsAsOf };
}
