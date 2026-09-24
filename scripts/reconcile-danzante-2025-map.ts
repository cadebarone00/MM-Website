/** Rebuild 2025 from Danzante Player Input/day sheets and the checked-in round map. */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { CareerHoleRecord, CareerTeamHoleRecord } from "../lib/data/careerStats";
const source = process.argv[2];
if (!source) throw new Error("Pass the Danzante workbook path.");
const archivePath = path.join(process.cwd(), "lib/data/careerArchive.generated.ts");
const mapPath = path.join(process.cwd(), "docs/source-data/2025_Danzante_Bay_Player_Round_Map.csv");
type Row = { Player: string; Round: string; Day_Sheet: string; Format: string; Partner: string; Scorecard_Sheet: string; Hole_Score_Cells: string };
const book = XLSX.readFile(source, { cellFormula: false });
const mapBook = XLSX.readFile(mapPath, { raw: true });
const map = XLSX.utils.sheet_to_json<Row>(mapBook.Sheets[mapBook.SheetNames[0]], { defval: "" });
if (map.length !== 48) throw new Error("Expected 48 Danzante map rows.");
const integer = (value: unknown) => Number.isInteger(Number(value)) ? Number(value) : null;
const boolean = (value: unknown) => value === 1 || value === true || String(value).trim() === "1" ? true : value === 0 || value === false || String(value).trim() === "0" ? false : null;
const valueAt = (sheet: XLSX.WorkSheet, r: number, c: number) => sheet[XLSX.utils.encode_cell({ r, c })]?.v;
function cells(reference: string) { return reference.split(",").flatMap((part) => { const [first, last = first] = part.trim().split(":"); const a = XLSX.utils.decode_cell(first), b = XLSX.utils.decode_cell(last); return Array.from({ length: b.c - a.c + 1 }, (_, offset) => ({ r: a.r, c: a.c + offset })); }); }
function teamMeta(sheet: XLSX.WorkSheet, cell: { r: number; c: number }, labelColumn: number) { let par: number | null = null, yards: number | null = null; for (let r = cell.r - 1; r >= cell.r - 8; r -= 1) { const label = String(valueAt(sheet, r, labelColumn) ?? "").trim().toLowerCase(); if (label === "par") par = integer(valueAt(sheet, r, cell.c)); if (label === "yards" || label === "yardage") yards = integer(valueAt(sheet, r, cell.c)); } return { par, yards }; }
const individual: CareerHoleRecord[] = [], alternate: CareerTeamHoleRecord[] = [];
const audit = new Map<string, number[]>(), seenTeams = new Set<string>();
for (const row of map) {
  const player = row.Player.trim().toUpperCase(), partner = row.Partner.trim().toUpperCase(), round = Number(row.Round), format = row.Format.trim();
  const sheet = book.Sheets[row.Scorecard_Sheet], scoreCells = cells(row.Hole_Score_Cells);
  if (!sheet || !player || scoreCells.length !== 18) throw new Error("Invalid map row for " + player + " round " + round + ".");
  const scores = scoreCells.map((cell) => integer(valueAt(sheet, cell.r, cell.c)));
  if (scores.some((score) => !score || score <= 0)) throw new Error("Incomplete mapped scores for " + player + " round " + round + ".");
  if (format !== "Alternate Shot") {
    scoreCells.forEach((cell, index) => { const par = integer(valueAt(sheet, cell.r - 2, cell.c)), yards = integer(valueAt(sheet, cell.r - 3, cell.c)); if (!par || !yards) throw new Error("Missing individual course data for " + player + " round " + round + "."); individual.push({ year: 2025, player, round, roundHoles: 18, course: "Danzante Bay", format, hole: index + 1, par, yards, score: scores[index]!, putts: integer(valueAt(sheet, cell.r + 1, cell.c)), fairwayInRegulation: boolean(valueAt(sheet, cell.r + 2, cell.c)), greenInRegulation: boolean(valueAt(sheet, cell.r + 3, cell.c)), penalties: null }); });
    audit.set(player, [...(audit.get(player) ?? []), round]); continue;
  }
  const pair = [player, partner].sort(), key = round + "-" + pair.join("-");
  if (!partner || seenTeams.has(key)) continue; seenTeams.add(key);
  scoreCells.forEach((cell, index) => { const { par, yards } = teamMeta(sheet, cell, scoreCells[0].c - 1); if (!par || !yards) throw new Error("Missing Alternate Shot course data for " + pair.join(" + ") + "."); alternate.push({ year: 2025, round, format, matchId: "MM2025-R" + round + "-" + pair.join("-"), teamId: pair.join("-"), player1: pair[0], player2: pair[1], course: "Danzante Bay", hole: index + 1, par, yards, score: scores[index]!, putts: null, fairwayInRegulation: null, greenInRegulation: null, penalties: null }); });
}
for (const [player, rounds] of audit) if (rounds.sort((a, b) => a - b).join(",") !== "1,3,5,6") throw new Error(player + " has incorrect individual rounds.");
if (audit.size !== 8 || individual.length !== 576 || alternate.length !== 144) throw new Error("Unexpected 2025 rebuild totals.");
function read<T>(file: string, name: string, next: string): T { const start = file.indexOf("export const " + name), end = file.indexOf("export const " + next, start), expression = file.slice(file.indexOf("=", start) + 1, file.lastIndexOf(";", end)).trim(); return (expression.startsWith("JSON.parse(") ? JSON.parse(JSON.parse(expression.slice(11, -1))) : JSON.parse(expression)) as T; }
const archive = fs.readFileSync(archivePath, "utf8");
const records = [...read<CareerHoleRecord[]>(archive, "careerArchiveRecords", "careerArchiveTeamRecords").filter((row) => row.year !== 2025), ...individual];
const teamRecords = [...read<CareerTeamHoleRecord[]>(archive, "careerArchiveTeamRecords", "careerArchivePartnerships").filter((row) => row.year !== 2025), ...alternate];
fs.writeFileSync(archivePath, archive.replace(/export const careerArchiveRecords: CareerHoleRecord\[\] = [\s\S]*?;\n\nexport const careerArchiveTeamRecords/, "export const careerArchiveRecords: CareerHoleRecord[] = JSON.parse(" + JSON.stringify(JSON.stringify(records)) + ");\n\nexport const careerArchiveTeamRecords").replace(/export const careerArchiveTeamRecords: CareerTeamHoleRecord\[\] = [\s\S]*?;\n\nexport const careerArchivePartnerships/, "export const careerArchiveTeamRecords: CareerTeamHoleRecord[] = JSON.parse(" + JSON.stringify(JSON.stringify(teamRecords)) + ");\n\nexport const careerArchivePartnerships"));
for (const [player, rounds] of [...audit].sort(([a], [b]) => a.localeCompare(b))) console.log(player + ": individual " + rounds.join(", ") + "; Alternate Shot 2, 4");
console.log("Rebuilt " + individual.length + " individual holes and " + alternate.length + " Alternate Shot team holes.");
