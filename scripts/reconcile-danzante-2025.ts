/**
 * Reconciles the 2025 individual archive against the original Danzante
 * Player Input worksheet. This sheet is the score/stat source of truth;
 * its five scorecard columns are explicitly labeled Rounds 1, 2, 3, 5, and
 * 6. Day sheets provide match context separately.
 *
 * Run:
 *   npx tsx scripts/reconcile-danzante-2025.ts "C:\\path\\Maroon Masters Danzante (2).xlsx"
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { CareerHoleRecord } from "../lib/data/careerStats";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the path to Maroon Masters Danzante (2).xlsx.");

const archivePath = path.join(process.cwd(), "lib/data/careerArchive.generated.ts");
const worksheet = XLSX.readFile(sourcePath, { cellFormula: false }).Sheets["Player Input"];
if (!worksheet) throw new Error('The workbook has no "Player Input" worksheet.');

const cell = (row: number, column: number) => worksheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
const integer = (value: unknown) => Number.isInteger(Number(value)) ? Number(value) : null;
const bool = (value: unknown) => value === 1 || value === true || String(value).trim() === "1" ? true : value === 0 || value === false || String(value).trim() === "0" ? false : null;

const FORMAT_BY_ROUND: Record<number, string> = {
  1: "Fourball",
  2: "Alternate Shot",
  3: "Fourball",
  5: "Singles",
  6: "Singles",
};

// Each player uses a 14-row block. The five cards begin at the first hole
// column for their labeled round; the worksheet deliberately has no R4 card.
const CARD_COLUMNS = [7, 31, 55, 79, 103];
const individualRecords: CareerHoleRecord[] = [];
const audit: { player: string; rounds: number[]; holes: number }[] = [];

for (let startRow = 9; startRow < 120; startRow += 14) {
  const player = String(cell(startRow, 1) ?? "").trim().toUpperCase();
  if (!player) continue;
  const rounds: number[] = [];

  for (const firstHoleColumn of CARD_COLUMNS) {
    const title = String(cell(startRow, firstHoleColumn - 1) ?? "");
    const match = title.match(/Round\s+(\d+)\s+Scorecard/i);
    if (!match) continue;
    const round = Number(match[1]);
    const format = FORMAT_BY_ROUND[round];
    if (!format) throw new Error(`Unexpected Danzante round ${round} for ${player}.`);

    const holes: CareerHoleRecord[] = [];
    for (let offset = 0; offset < 18; offset += 1) {
      const column = firstHoleColumn + offset;
      const score = integer(cell(startRow + 5, column));
      const par = integer(cell(startRow + 3, column));
      const yards = integer(cell(startRow + 2, column));
      if (!score || !par || !yards) continue;
      holes.push({
        year: 2025,
        player,
        round,
        roundHoles: 18,
        course: "Danzante Bay",
        format,
        hole: offset + 1,
        par,
        yards,
        score,
        putts: integer(cell(startRow + 6, column)),
        fairwayInRegulation: bool(cell(startRow + 7, column)),
        greenInRegulation: bool(cell(startRow + 8, column)),
        penalties: null,
      });
    }

    if (holes.length === 0) continue;
    if (holes.length !== 18) throw new Error(`${player} round ${round} has ${holes.length} scored holes; expected 18.`);
    rounds.push(round);
    individualRecords.push(...holes);
  }
  audit.push({ player, rounds, holes: rounds.length * 18 });
}

function readExport<T>(source: string, name: string, nextName: string): T {
  const start = source.indexOf(`export const ${name}`);
  const end = source.indexOf(`export const ${nextName}`, start);
  if (start < 0 || end < 0) throw new Error(`Could not read ${name} from the generated archive.`);
  const jsonStart = source.indexOf("=", start) + 1;
  const jsonEnd = source.lastIndexOf(";", end);
  const expression = source.slice(jsonStart, jsonEnd).trim();
  return (expression.startsWith("JSON.parse(")
    ? JSON.parse(JSON.parse(expression.slice("JSON.parse(".length, -1)))
    : JSON.parse(expression)) as T;
}

type OtherRecord = CareerHoleRecord;
const archive = fs.readFileSync(archivePath, "utf8");
const existingRecords = readExport<OtherRecord[]>(archive, "careerArchiveRecords", "careerArchiveTeamRecords");
const retainedRecords = existingRecords.filter((record) => !(record.year === 2025 && /danzante bay/i.test(record.course)));
const nextRecords = [...retainedRecords, ...individualRecords].map((record) => ({
  ...record,
  course: /^tpc\s+danzante bay$/i.test(record.course) ? "Danzante Bay" : record.course,
}));

// Preserve the already-separated team history and partnership results, while
// canonicalizing the course label across every archive collection.
const nextArchive = archive
  .replace(/export const careerArchiveRecords: CareerHoleRecord\[\] = [\s\S]*?;\n\nexport const careerArchiveTeamRecords/, `export const careerArchiveRecords: CareerHoleRecord[] = JSON.parse(${JSON.stringify(JSON.stringify(nextRecords))});\n\nexport const careerArchiveTeamRecords`)
  .replaceAll('"course":"TPC Danzante Bay"', '"course":"Danzante Bay"');
fs.writeFileSync(archivePath, nextArchive);

console.table(audit);
console.log(`Rebuilt ${individualRecords.length} Danzante individual holes from ${path.basename(sourcePath)}.`);
