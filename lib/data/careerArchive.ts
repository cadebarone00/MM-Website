/** Normalize the workbook once at its import boundary; database/live rows are already canonical. */
import { careerArchiveRecords as records, careerArchiveTeamRecords as teamRecords } from "./careerArchive.generated";
import { generatedCareerRound } from "./roundIdentity";
export { careerArchiveCourseHoles, careerArchivePartnerships } from "./careerArchive.generated";
export const careerArchiveRecords = records.map(row => ({ ...row, round: generatedCareerRound(row.year, row.round) }));
export const careerArchiveTeamRecords = teamRecords.map(row => ({ ...row, round: generatedCareerRound(row.year, row.round) }));
