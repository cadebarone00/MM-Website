import { mergeCareerRecords } from "./mergeCareerRecords";
import { careerArchiveRecords, careerArchiveTeamRecords } from "./careerArchive";
import { getHistoricalCareerRecords, getHandicapCareerRecords, getLiveCareerArchiveRecords, getLiveCareerArchiveTeamRecords } from "./careerStatsDatabase";
import { getPlayerSlug } from "./players";

/** Shared input for Tiger's Career Stats, the model lab, and published match odds. */
export async function getCombinedCareerArchive(options: { includeTestSeason?: boolean } = {}) {
  const [live, team, other, edited] = await Promise.all([
    getLiveCareerArchiveRecords(options), getLiveCareerArchiveTeamRecords(options), getHandicapCareerRecords(), getHistoricalCareerRecords(),
  ]);
  const player = (value: string) => getPlayerSlug(value);
  return {
    records: [...mergeCareerRecords(careerArchiveRecords, edited.records, edited.keys), ...live, ...other].map((row) => ({ ...row, player: player(row.player) })),
    teamRecords: [...careerArchiveTeamRecords, ...team].map((row) => ({ ...row, player1: player(row.player1), player2: player(row.player2) })),
  };
}
