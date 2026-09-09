import { careerArchiveRecords, careerArchiveTeamRecords } from "./careerArchive";
import { getHandicapCareerRecords, getLiveCareerArchiveRecords, getLiveCareerArchiveTeamRecords } from "./careerStatsDatabase";
import { getPlayerProfileBySlug } from "./players";

/** Shared input for Tiger's Career Stats, the model lab, and published match odds. */
export async function getCombinedCareerArchive(options: { includeTestSeason?: boolean } = {}) {
  const [live, team, other] = await Promise.all([
    getLiveCareerArchiveRecords(options), getLiveCareerArchiveTeamRecords(options), getHandicapCareerRecords(),
  ]);
  const player = (value: string) => getPlayerProfileBySlug(value)?.id ?? value;
  return {
    records: [...careerArchiveRecords, ...live, ...other].map((row) => ({ ...row, player: player(row.player) })),
    teamRecords: [...careerArchiveTeamRecords, ...team].map((row) => ({ ...row, player1: player(row.player1), player2: player(row.player2) })),
  };
}
