import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { getPlayerDisplayName, getPlayerSlug } from "@/lib/data/players";
import { isEligibleIndividualHole } from "@/lib/odds/preRoundSingles";
import { isTestSeason } from "@/lib/live/testSeason";
import { scoreKey } from "@/lib/live/types";
import { latestMatchInput, pages, type Service } from "./futureInputs";
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
  inputsAsOf: string | null;
};

const INDIVIDUAL_FORMATS = new Set(["Singles", "Fourball"]);

/** Pre-tournament nothing publishes match odds, so public reads reprice on this cadence. */
export const MAX_SNAPSHOT_AGE_MS = 10 * 60 * 1000;
/** If a score landed but no refresh followed it, public reads self-heal after this long. */
export const STALE_GRACE_MS = 30 * 1000;

/** Whether a snapshot predates the latest match data. */
export function isStaleSnapshot(snapshot: { inputs_as_of?: string | null } | null, latestInput: string | null): boolean {
  return Boolean(latestInput && (!snapshot?.inputs_as_of || latestInput > snapshot.inputs_as_of));
}

/** Whether a public read should recompute before answering. */
export function needsRepublish(snapshot: { created_at: string; inputs_as_of?: string | null } | null, latestInput: string | null): boolean {
  const age = snapshot ? Date.now() - new Date(snapshot.created_at).getTime() : Infinity;
  const staleTooLong = isStaleSnapshot(snapshot, latestInput) && latestInput !== null && Date.now() - new Date(latestInput).getTime() > STALE_GRACE_MS;
  return age > MAX_SNAPSHOT_AGE_MS || staleTooLong;
}

export async function loadIndividualInputs(service: Service, seasonYear: number): Promise<IndividualInputs> {
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
    if (!INDIVIDUAL_FORMATS.has(format)) continue; // Foursome rounds produce no individual scores.
    const course = snapshot.courses[snapshot.roundCourses[number]];
    if (!course) { blockers.push(`Round ${number} needs a course.`); continue; }
    rounds.push({ round: number, holes: course.holes.map((hole) => ({ hole: hole.number, par: hole.par, yards: hole.yards })) });
  }
  if (roundCount && !blockers.length && !rounds.length) blockers.push("No Singles or Fourball rounds are scheduled.");

  const played: PlayedScore = (player, round, hole) => {
    const score = snapshot.scores.get(scoreKey(player, round, hole))?.score;
    return score && score > 0 ? score : null;
  };

  const history = new Map<string, HistoryRow[]>();
  if (!blockers.length) {
    const archive = await getCombinedCareerArchive({ includeTestSeason: isTestSeason(seasonYear) });
    const byModelSlug = new Map<string, HistoryRow[]>();
    for (const row of archive.records) {
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

  return { seasonYear, players, rounds, played, history, blockers, inputsAsOf };
}
