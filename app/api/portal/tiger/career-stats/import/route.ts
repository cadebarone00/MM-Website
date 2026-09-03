import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SheetRow = Record<string, unknown>;
const key = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (value: unknown) => { const result = String(value ?? "").trim(); return result || null; };
const integer = (value: unknown) => { const result = Number(value); return Number.isInteger(result) ? result : null; };
const decimal = (value: unknown) => { const result = Number(value); return Number.isFinite(result) ? result : null; };
const bool = (value: unknown) => value === true || value === 1 || String(value).trim() === "1" ? true : value === false || value === 0 || String(value).trim() === "0" ? false : null;

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

function value(row: SheetRow, ...names: string[]) { return names.map(key).map((name) => row[name]).find((item) => item !== undefined); }
function cleanDate(raw: unknown) { const candidate = text(raw); return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null; }

function mapIndividual(row: SheetRow) {
  const score = integer(value(row, "score"));
  return {
    event_id: text(value(row, "event_id")), year: integer(value(row, "year")), tournament: text(value(row, "tournament")), played_on: cleanDate(value(row, "date")),
    day: text(value(row, "day")), round: integer(value(row, "round")), round_holes: integer(value(row, "round_holes")), format: text(value(row, "format")),
    match_id: text(value(row, "match_id")), team: text(value(row, "team")), player: text(value(row, "player")), partner_1: text(value(row, "partner_1")), partner_2: text(value(row, "partner_2")),
    opponent_1: text(value(row, "opponent_1")), opponent_2: text(value(row, "opponent_2")), course: text(value(row, "course")), tee: text(value(row, "tee")),
    hole: integer(value(row, "hole")), par: integer(value(row, "par")), yards: integer(value(row, "yards")), hole_type: text(value(row, "hole_type")),
    hole_length_bucket: text(value(row, "hole_length_bucket")), course_length: decimal(value(row, "course_length")), course_length_bucket: text(value(row, "course_length_bucket")),
    score, diff_vs_par: integer(value(row, "score_to_par", "diff_vs_par")), score_type: text(value(row, "score_type")), putts: integer(value(row, "putts")),
    fairway_in_regulation: bool(value(row, "fairway_in_regulation")), green_in_regulation: bool(value(row, "green_in_regulation")), penalties: integer(value(row, "penalties")),
    entered_at: cleanDate(value(row, "entered_at")), entered_by: text(value(row, "entered_by")), source_record_id: text(value(row, "source_record_id")),
    google_sheet_row_id: text(value(row, "google_sheet_row_id")), sync_status: text(value(row, "sync_status")), source_workbook: text(value(row, "source_workbook")),
    source_sheet: text(value(row, "source_sheet")), source_cell: text(value(row, "source_cell")), data_quality_flags: text(value(row, "data_quality_flags")),
  };
}

function mapTeam(row: SheetRow) {
  return {
    event_id: text(value(row, "event_id")), year: integer(value(row, "year")), round: integer(value(row, "round")), format: text(value(row, "format")), match_id: text(value(row, "match_id")),
    team_id: text(value(row, "team_id")), player_1: text(value(row, "player_1")), player_2: text(value(row, "player_2")), opponent_team_id: text(value(row, "opponent_team_id")),
    course: text(value(row, "course")), hole: integer(value(row, "hole")), par: integer(value(row, "par")), yards: integer(value(row, "yards")), team_score: integer(value(row, "team_score")),
    team_score_to_par: integer(value(row, "team_score_to_par")), team_score_type: text(value(row, "team_score_type")), best_ball_score: integer(value(row, "best_ball_score")),
    winning_side: text(value(row, "winning_side")), result_text: text(value(row, "result_text")), source_record_id: text(value(row, "source_record_id")),
    source_workbook: text(value(row, "source_workbook")), source_sheet: text(value(row, "source_sheet")), source_cell: text(value(row, "source_cell")), data_quality_flags: text(value(row, "data_quality_flags")),
  };
}

function mapMatch(row: SheetRow) {
  return {
    event_id: text(value(row, "event_id")), year: integer(value(row, "year")), round: integer(value(row, "round")), played_on: cleanDate(value(row, "date")), format: text(value(row, "format")),
    match_id: text(value(row, "match_id")), maroon_players: text(value(row, "maroon_players")), white_players: text(value(row, "white_players")), winning_side: text(value(row, "winning_side")),
    result_text: text(value(row, "result_text")), holes_played: integer(value(row, "holes_played")), final_status: text(value(row, "final_status")), team_points: decimal(value(row, "team_points")),
    match_notes: text(value(row, "match_notes")), source_workbook: text(value(row, "source_workbook")), source_sheet: text(value(row, "source_sheet")), source_cell: text(value(row, "source_cell")), data_quality_flags: text(value(row, "data_quality_flags")),
  };
}

function mapParticipant(row: SheetRow) {
  return {
    event_id: text(value(row, "event_id")), year: integer(value(row, "year")), round: integer(value(row, "round")), format: text(value(row, "format")), match_id: text(value(row, "match_id")),
    team_id: text(value(row, "team_id")), player: text(value(row, "player")), partner: text(value(row, "partner")), opponent_1: text(value(row, "opponent_1")), opponent_2: text(value(row, "opponent_2")),
    winning_side: text(value(row, "winning_side")), result_text: text(value(row, "result_text")), source_workbook: text(value(row, "source_workbook")), source_sheet: text(value(row, "source_sheet")), source_cell: text(value(row, "source_cell")), data_quality_flags: text(value(row, "data_quality_flags")),
  };
}

async function insertBatches(service: ReturnType<typeof createSupabaseServiceRoleClient>, table: string, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await service.from(table).insert(rows.slice(index, index + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ ok: false, error: "Upload the Career Data & Odds Model .xlsx workbook." }, { status: 400 });

  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" }); }
  catch { return NextResponse.json({ ok: false, error: "That workbook could not be read." }, { status: 400 }); }
  const individual = rowsFromSheet(workbook, "Raw_Hole_Results", ["year", "player", "score"]).map(mapIndividual).filter((row) => row.round_holes === 18);
  const teamHoles = rowsFromSheet(workbook, "Raw_Team_Hole_Results", ["year", "team_id", "team_score"]).map(mapTeam);
  const matches = rowsFromSheet(workbook, "Raw_Match_Results", ["year", "match_id", "format"]).map(mapMatch);
  const participants = rowsFromSheet(workbook, "Match_Participants", ["year", "match_id", "player"]).map(mapParticipant);
  const invalidIndividual = individual.some((row) => !row.event_id || !row.year || !row.player || !row.round || !row.course || !row.hole || !row.par || !row.yards || !row.score || !row.source_record_id);
  if (!individual.length || invalidIndividual) return NextResponse.json({ ok: false, error: "Raw_Hole_Results is missing required source-traceable values." }, { status: 400 });
  if (new Set(individual.map((row) => row.source_record_id)).size !== individual.length) return NextResponse.json({ ok: false, error: "Raw_Hole_Results contains duplicate source record IDs." }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  try {
    await Promise.all([
      service.from("career_match_participants").delete().gte("year", 0), service.from("career_stat_matches").delete().gte("year", 0), service.from("career_stat_team_holes").delete().gte("year", 0),
      service.from("career_stat_holes").delete().gte("year", 0), service.from("career_stat_partnerships").delete().gte("year", 0), service.from("career_stats_workbook_sheets").delete().neq("sheet_name", ""),
    ]);
    await insertBatches(service, "career_stat_holes", individual);
    if (teamHoles.length) await insertBatches(service, "career_stat_team_holes", teamHoles);
    if (matches.length) await insertBatches(service, "career_stat_matches", matches);
    if (participants.length) await insertBatches(service, "career_match_participants", participants);
    const sheets = workbook.SheetNames.map((sheetName) => ({ sheet_name: sheetName, source_file: file.name, imported_by: host.userId, sheet_data: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }) }));
    await insertBatches(service, "career_stats_workbook_sheets", sheets);
    const { error } = await service.from("career_stat_imports").insert({ source_file: file.name, imported_by: host.userId, individual_hole_count: individual.length, team_hole_count: teamHoles.length, match_count: matches.length, participant_count: participants.length });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("career stats import failed", error);
    return NextResponse.json({ ok: false, error: "Import failed. Run the latest Supabase schema, then try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, holes: individual.length, partnerships: participants.length, individualHoles: individual.length, teamHoles: teamHoles.length, matches: matches.length, participants: participants.length });
}
