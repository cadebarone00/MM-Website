import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

type SheetRow = Record<string, unknown>;

const input = process.argv[2];
if (!input) throw new Error("Usage: npx tsx scripts/build-career-archive.ts <Career-Data-and-Odds-Model.xlsx>");

const key = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (value: unknown) => String(value ?? "").trim();
const integer = (value: unknown) => {
  const result = Number(value);
  return Number.isInteger(result) ? result : null;
};

function rowsFromSheet(workbook: XLSX.WorkBook, sheetName: string, required: string[]): SheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const requiredKeys = required.map(key);
  const headerIndex = grid.findIndex((row) => {
    const headers = new Set(row.map(key));
    return requiredKeys.every((field) => headers.has(field));
  });
  if (headerIndex < 0) return [];
  const headers = grid[headerIndex].map(key);
  return grid.slice(headerIndex + 1)
    .filter((row) => row.some((value) => text(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function value(row: SheetRow, name: string) { return row[key(name)]; }

const workbook = XLSX.readFile(input);
const records = rowsFromSheet(workbook, "Raw_Hole_Results", ["year", "player", "score"])
  .map((row) => ({
    year: integer(value(row, "year")), player: text(value(row, "player")), round: integer(value(row, "round")), roundHoles: integer(value(row, "round_holes")),
    course: text(value(row, "course")), format: text(value(row, "format")) || "Unspecified", hole: integer(value(row, "hole")), par: integer(value(row, "par")), yards: integer(value(row, "yards")), score: integer(value(row, "score")),
  }))
  .filter((row) => row.roundHoles === 18 && row.year && row.player && row.round && row.course && row.hole && row.par && row.yards && row.score);

const teamRecords = rowsFromSheet(workbook, "Raw_Team_Hole_Results", ["year", "team_id", "team_score"])
  .map((row) => ({
    year: integer(value(row, "year")), round: integer(value(row, "round")), format: text(value(row, "format")) || "Unspecified", matchId: text(value(row, "match_id")),
    teamId: text(value(row, "team_id")), player1: text(value(row, "player_1")), player2: text(value(row, "player_2")), course: text(value(row, "course")),
    hole: integer(value(row, "hole")), par: integer(value(row, "par")), yards: integer(value(row, "yards")), score: integer(value(row, "team_score")),
  }))
  .filter((row) => row.year && row.round && row.matchId && row.teamId && row.player1 && row.course && row.hole && row.par && row.yards && row.score);

const partnerships = rowsFromSheet(workbook, "Match_Participants", ["year", "match_id", "player"])
  .flatMap((row) => {
    const player = text(value(row, "player"));
    const partner = text(value(row, "partner"));
    const winningSide = text(value(row, "winning_side")).toUpperCase();
    const teamId = text(value(row, "team_id")).toUpperCase();
    if (!player || !partner) return [];
    return [{ player, partner, year: integer(value(row, "year")), format: text(value(row, "format")) || "Unspecified", result: winningSide === "HALVED" ? "halve" : winningSide === teamId ? "win" : "loss" }];
  })
  .filter((row) => row.year);

const source = `// Generated from ${path.basename(input)} by scripts/build-career-archive.ts. Do not hand-edit.\nimport type { CareerHoleRecord, CareerPartnership, CareerTeamHoleRecord } from "./careerStats";\n\nexport const careerArchiveRecords: CareerHoleRecord[] = ${JSON.stringify(records)};\n\nexport const careerArchiveTeamRecords: CareerTeamHoleRecord[] = ${JSON.stringify(teamRecords)};\n\nexport const careerArchivePartnerships: CareerPartnership[] = ${JSON.stringify(partnerships)};\n`;
fs.writeFileSync(path.join(process.cwd(), "lib/data/careerArchive.generated.ts"), source);
console.log(`Built archive: ${records.length} individual holes, ${teamRecords.length} team holes, ${partnerships.length} partnership rows.`);
