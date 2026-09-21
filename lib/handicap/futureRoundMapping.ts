import type { RoundFormatSetup } from "@/lib/data/roundFormatSetups";
import type { ArchivedHandicapRound } from "./types";
import { mapHandicapSetup } from "./teeSetup";
import { isTestSeason } from "../live/testSeason.ts";

export interface FutureRoundRow {
  season_year: number; round: number; course: string; played_on: string | null;
  format: string; handicap_setup: unknown;
  /** career_archive_rounds.status — only 'submitted' (player and scorer both submitted) or 'final' rounds are official. */
  status: string;
}
export interface FutureHoleRow { season_year: number; round: number; hole: number; score: number | null; did_not_finish: boolean }

/** `includeTestSeason` is only for Tiger's test-season status view; the real handicap never counts the 2034 rehearsal. */
export function mapFutureHandicapRounds(rows: FutureRoundRow[], holes: FutureHoleRow[], setups: RoundFormatSetup[], options: { includeTestSeason?: boolean } = {}): (ArchivedHandicapRound & { seasonYear: number })[] {
  return rows.flatMap((row) => {
    if (!options.includeTestSeason && isTestSeason(row.season_year)) return [];
    if (row.status !== "submitted" && row.status !== "final") return [];
    const confirmed = holes.filter((hole) => hole.season_year === row.season_year && hole.round === row.round && hole.score != null && hole.score > 0);
    if (!confirmed.length) return [];
    const setup = setups.find((s) => s.seasonYear === row.season_year && s.round === row.round);
    const teeSetup = mapHandicapSetup(setup ? setup.teeSetup : row.handicap_setup);
    return [{
      id: `live-${row.season_year}-${row.round}`, seasonYear: row.season_year, live: true,
      tournamentSlug: String(row.season_year), tournamentLabel: `${row.season_year} Maroon Masters`,
      tournamentDate: setup?.datePlayed ?? row.played_on ?? "", round: row.round,
      courseName: setup?.courseName ?? row.course, courseLibraryId: teeSetup?.courseId ?? null,
      format: row.format, datePlayed: setup?.datePlayed ?? row.played_on, teeSetup,
      totalScore: confirmed.reduce((sum, hole) => sum + hole.score!, 0),
      // Pickups are not completed individual holes. Disputed scores are absent
      // from this confirmed archive, so neither can create an eligible round.
      holesPlayed: new Set(confirmed.filter((hole) => !hole.did_not_finish).map((hole) => hole.hole)).size,
    }];
  });
}
