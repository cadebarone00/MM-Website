/** Converts the large generated archive literals into typed runtime JSON.
 * This avoids TypeScript/Turbopack union-inference limits while preserving
 * exactly the same archive data. */
import fs from "node:fs";
import path from "node:path";

const archivePath = path.join(process.cwd(), "lib/data/careerArchive.generated.ts");
const source = fs.readFileSync(archivePath, "utf8");

function extract(name: string, nextName?: string): unknown[] {
  const start = source.indexOf(`export const ${name}`);
  const end = nextName ? source.indexOf(`export const ${nextName}`, start) : source.length;
  if (start < 0 || end < 0) throw new Error(`Could not read ${name}.`);
  const expression = source.slice(source.indexOf("=", start) + 1, source.lastIndexOf(";", end)).trim();
  if (expression.startsWith("JSON.parse(")) return JSON.parse(JSON.parse(expression.slice("JSON.parse(".length, -1))) as unknown[];
  return JSON.parse(expression) as unknown[];
}

const records = extract("careerArchiveRecords", "careerArchiveTeamRecords");
const teamRecords = extract("careerArchiveTeamRecords", "careerArchivePartnerships");
const partnerships = extract("careerArchivePartnerships", "careerArchiveCourseHoles");
const courseHoles = extract("careerArchiveCourseHoles");
const json = (value: unknown) => `JSON.parse(${JSON.stringify(JSON.stringify(value))})`;

fs.writeFileSync(archivePath, `// Generated archive data. Rebuild with the archive reconciliation scripts; do not hand-edit.\nimport type { CareerCourseHole, CareerHoleRecord, CareerPartnership, CareerTeamHoleRecord } from "./careerStats";\n\nexport const careerArchiveRecords: CareerHoleRecord[] = ${json(records)};\n\nexport const careerArchiveTeamRecords: CareerTeamHoleRecord[] = ${json(teamRecords)};\n\nexport const careerArchivePartnerships: CareerPartnership[] = ${json(partnerships)};\n\nexport const careerArchiveCourseHoles: CareerCourseHole[] = ${json(courseHoles)};\n`);
console.log(`Compacted ${records.length} individual holes, ${teamRecords.length} team holes, ${partnerships.length} partnership rows, and ${courseHoles.length} course-hole rows.`);
