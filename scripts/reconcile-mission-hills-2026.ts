/** Rebuild 2026 individual hole records from the Day 1–4 scorecard blocks. */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { CareerHoleRecord } from "../lib/data/careerStats";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the path to 2026 Maroon Masters (3).xlsx.");
const archivePath = path.join(process.cwd(), "lib/data/careerArchive.generated.ts");

const ROUND_CONTEXT: Record<number, { course: string; format: string }> = {
  1: { course: "Palmer", format: "Fourball" },
  3: { course: "Cove", format: "Fourball" },
  4: { course: "Classic", format: "Singles" },
  5: { course: "Pete Dye", format: "Fourball" },
  7: { course: "Pete Dye", format: "Singles" },
  8: { course: "Tournament", format: "Singles" },
};

const workbook = XLSX.readFile(sourcePath, { cellFormula: false });
const records: CareerHoleRecord[] = [];
const audit = new Map<string, number[]>();

for (const sheetName of ["Day 1", "Day 2", "Day 3", "Day 4"]) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing ${sheetName}.`);
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const title = String(sheet[address]?.v ?? "");
    const match = title.match(/^(.*?)\s*Round\s+(\d+)\s+Scorecard$/i);
    if (!match) continue;
    const anchor = XLSX.utils.decode_cell(address);
    // A few scorecard titles omit the player name, but the workbook still
    // labels that card's block in column A (for example, "Nate" beside
    // "Round 1 Scorecard"). Do not drop a complete card for presentation
    // formatting in the input sheet.
    const headerPlayer = String(sheet[XLSX.utils.encode_cell({ r: anchor.r, c: 0 })]?.v ?? "").trim();
    const player = (match[1].trim() || headerPlayer).toUpperCase();
    const round = Number(match[2]);
    const context = ROUND_CONTEXT[round];
    if (!player || !context) continue;

    const valueAt = (rowOffset: number, holeOffset: number) => sheet[XLSX.utils.encode_cell({ r: anchor.r + rowOffset, c: anchor.c + 1 + holeOffset })]?.v;
    const asInteger = (value: unknown) => Number.isInteger(Number(value)) ? Number(value) : null;
    const asBoolean = (value: unknown) => value === 1 || value === true || String(value).trim() === "1" ? true : value === 0 || value === false || String(value).trim() === "0" ? false : null;
    const card: CareerHoleRecord[] = [];

    for (let holeOffset = 0; holeOffset < 18; holeOffset += 1) {
      const score = asInteger(valueAt(5, holeOffset));
      const par = asInteger(valueAt(3, holeOffset));
      const yards = asInteger(valueAt(2, holeOffset));
      if (!score || !par || !yards) continue;
      card.push({ year: 2026, player, round, roundHoles: 18, course: context.course, format: context.format, hole: holeOffset + 1, par, yards, score, putts: asInteger(valueAt(6, holeOffset)), fairwayInRegulation: asBoolean(valueAt(7, holeOffset)), greenInRegulation: asBoolean(valueAt(8, holeOffset)), penalties: null });
    }
    if (card.length !== 18) throw new Error(`${sheetName}: ${player} Round ${round} has ${card.length} scored holes.`);
    records.push(...card);
    audit.set(player, [...(audit.get(player) ?? []), round]);
  }
}

function readRecords(source: string): CareerHoleRecord[] {
  const start = source.indexOf("export const careerArchiveRecords");
  const end = source.indexOf("export const careerArchiveTeamRecords", start);
  if (start < 0 || end < 0) throw new Error("Could not read careerArchiveRecords.");
  const expression = source.slice(source.indexOf("=", start) + 1, source.lastIndexOf(";", end)).trim();
  return (expression.startsWith("JSON.parse(")
    ? JSON.parse(JSON.parse(expression.slice("JSON.parse(".length, -1)))
    : JSON.parse(expression)) as CareerHoleRecord[];
}

const archive = fs.readFileSync(archivePath, "utf8");
const nextRecords = [...readRecords(archive).filter((record) => record.year !== 2026), ...records];
const nextArchive = archive.replace(/export const careerArchiveRecords: CareerHoleRecord\[\] = [\s\S]*?;\n\nexport const careerArchiveTeamRecords/, `export const careerArchiveRecords: CareerHoleRecord[] = JSON.parse(${JSON.stringify(JSON.stringify(nextRecords))});\n\nexport const careerArchiveTeamRecords`);
fs.writeFileSync(archivePath, nextArchive);

for (const [player, rounds] of [...audit.entries()].sort(([a], [b]) => a.localeCompare(b))) console.log(`${player}: ${rounds.sort((a, b) => a - b).join(", ")} (${rounds.length * 18} holes)`);
console.log(`Rebuilt ${records.length} Mission Hills individual holes from ${path.basename(sourcePath)}.`);
