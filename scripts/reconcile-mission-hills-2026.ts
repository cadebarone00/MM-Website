/** Rebuild 2026 from the original workbook and checked-in round map. */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { CareerHoleRecord, CareerTeamHoleRecord } from "../lib/data/careerStats";

const source = process.argv[2];
if (!source) throw new Error("Pass the 2026 Maroon Masters workbook path.");
const archivePath = path.join(process.cwd(), "lib/data/careerArchive.generated.ts");
const mapPath = path.join(process.cwd(), "docs/source-data/2026_Maroon_Masters_Player_Round_Map.csv");
const course: Record<number, string> = { 1: "Palmer", 2: "Pete Dye", 3: "Cove", 4: "Classic", 5: "Palmer", 6: "Pete Dye", 7: "Pete Dye", 8: "Tournament" };
type MapRow = { Player: string; Round: string; Sheet: string; Format: string; Partner: string; Hole_Score_Cells: string };
const book = XLSX.readFile(source, { cellFormula: false });
const mapBook = XLSX.readFile(mapPath, { raw: true });
const map = XLSX.utils.sheet_to_json<MapRow>(mapBook.Sheets[mapBook.SheetNames[0]], { defval: "" });
if (map.length !== 96) throw new Error("Expected 96 player-round map rows.");
const integer = (value: unknown) => Number.isInteger(Number(value)) ? Number(value) : null;
const boolean = (value: unknown) => value === 1 || value === true || String(value).trim() === "1" ? true : value === 0 || value === false || String(value).trim() === "0" ? false : null;
const valueAt = (sheet: XLSX.WorkSheet, row: number, column: number) => sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
function holeMeta(sheet: XLSX.WorkSheet, cell: { r: number; c: number }, labelColumn: number) {
  let par: number | null = null, yards: number | null = null;
  for (let row = cell.r - 1; row >= cell.r - 8; row -= 1) {
    const label = String(valueAt(sheet, row, labelColumn) ?? "").trim().toLowerCase();
    if (label === "par") par = integer(valueAt(sheet, row, cell.c));
    if (label === "yards") yards = integer(valueAt(sheet, row, cell.c));
  }
  return { par, yards };
}
function cells(reference: string) {
  return reference.split(",").flatMap((part) => {
    const range = part.trim().split(":");
    const from = XLSX.utils.decode_cell(range[0]), to = XLSX.utils.decode_cell(range[1] ?? range[0]);
    if (from.r !== to.r) throw new Error("Mapped score ranges must be one row.");
    return Array.from({ length: to.c - from.c + 1 }, (_, offset) => ({ r: from.r, c: from.c + offset }));
  });
}
const individual: CareerHoleRecord[] = [];
const alternate: CareerTeamHoleRecord[] = [];
const audit = new Map<string, number[]>();
const seenTeams = new Set<string>();
for (const row of map) {
  const player = row.Player.trim().toUpperCase();
  const partner = row.Partner.trim().toUpperCase();
  const round = Number(row.Round);
  const format = row.Format.trim();
  const sheet = book.Sheets[row.Sheet];
  const scoreCells = cells(row.Hole_Score_Cells);
  if (!sheet || !course[round] || scoreCells.length !== 18) throw new Error("Invalid round-map row for " + player + " round " + round + ".");
  const scores = scoreCells.map((cell) => integer(valueAt(sheet, cell.r, cell.c)));
  if (scores.some((score) => !score || score <= 0)) throw new Error("Incomplete scores for " + player + " round " + round + ".");
  if (format !== "Alternate Shot") {
    scoreCells.forEach((cell, index) => {
      const par = integer(valueAt(sheet, cell.r - 2, cell.c));
      const yards = integer(valueAt(sheet, cell.r - 3, cell.c));
      if (!par || !yards) throw new Error("Missing course data for " + player + " round " + round + ".");
      individual.push({ year: 2026, player, round, roundHoles: 18, course: course[round], format, hole: index + 1, par, yards, score: scores[index]!, putts: integer(valueAt(sheet, cell.r + 1, cell.c)), fairwayInRegulation: boolean(valueAt(sheet, cell.r + 2, cell.c)), greenInRegulation: boolean(valueAt(sheet, cell.r + 3, cell.c)), penalties: null });
    });
    audit.set(player, [...(audit.get(player) ?? []), round]);
    continue;
  }
  const pair = [player, partner].sort();
  const key = round + "-" + pair.join("-");
  if (!partner || seenTeams.has(key)) continue;
  seenTeams.add(key);
  scoreCells.forEach((cell, index) => {
    const { par, yards } = holeMeta(sheet, cell, scoreCells[0].c - 1);
    if (!par || !yards) throw new Error("Missing Alternate Shot course data for " + pair.join(" + ") + ".");
    alternate.push({ year: 2026, round, format, matchId: "MM2026-R" + round + "-" + pair.join("-"), teamId: pair.join("-"), player1: pair[0], player2: pair[1], course: course[round], hole: index + 1, par, yards, score: scores[index]!, putts: null, fairwayInRegulation: null, greenInRegulation: null, penalties: null });
  });
}
for (const [player, rounds] of audit) if (rounds.sort((a, b) => a - b).join(",") !== "1,3,4,6,7,8") throw new Error(player + " individual rounds are incorrect: " + rounds.join(",") + ".");
if (audit.size !== 12 || individual.length !== 1296 || alternate.length !== 216) throw new Error("Unexpected rebuild totals.");
function read<T>(file: string, name: string, next: string): T {
  const start = file.indexOf("export const " + name), end = file.indexOf("export const " + next, start);
  const expression = file.slice(file.indexOf("=", start) + 1, file.lastIndexOf(";", end)).trim();
  return (expression.startsWith("JSON.parse(") ? JSON.parse(JSON.parse(expression.slice(11, -1))) : JSON.parse(expression)) as T;
}
const archive = fs.readFileSync(archivePath, "utf8");
const records = [...read<CareerHoleRecord[]>(archive, "careerArchiveRecords", "careerArchiveTeamRecords").filter((record) => record.year !== 2026), ...individual];
const teamRecords = [...read<CareerTeamHoleRecord[]>(archive, "careerArchiveTeamRecords", "careerArchivePartnerships").filter((record) => record.year !== 2026), ...alternate];
const next = archive
  .replace(/export const careerArchiveRecords: CareerHoleRecord\[\] = [\s\S]*?;\n\nexport const careerArchiveTeamRecords/, "export const careerArchiveRecords: CareerHoleRecord[] = JSON.parse(" + JSON.stringify(JSON.stringify(records)) + ");\n\nexport const careerArchiveTeamRecords")
  .replace(/export const careerArchiveTeamRecords: CareerTeamHoleRecord\[\] = [\s\S]*?;\n\nexport const careerArchivePartnerships/, "export const careerArchiveTeamRecords: CareerTeamHoleRecord[] = JSON.parse(" + JSON.stringify(JSON.stringify(teamRecords)) + ");\n\nexport const careerArchivePartnerships");
fs.writeFileSync(archivePath, next);
for (const [player, rounds] of [...audit].sort(([a], [b]) => a.localeCompare(b))) console.log(player + ": individual " + rounds.join(", ") + "; Alternate Shot 2, 5");
console.log("Rebuilt " + individual.length + " individual holes and " + alternate.length + " Alternate Shot team holes.");
