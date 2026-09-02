import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type SheetRow = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
function findValue(row: SheetRow, ...names: string[]) { return names.map(key).map((name) => row[name]).find((value) => value !== undefined); }
function scoreType(score: number, par: number) { const diff = score - par; return diff <= -2 ? "Eagle or Better" : diff === -1 ? "Birdie" : diff === 0 ? "Par" : diff === 1 ? "Bogey" : "Double Bogey or Worse"; }

function toObjects(sheet: XLSX.WorkSheet): SheetRow[] {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = grid.findIndex((row) => row.some((cell) => key(text(cell)) === "year") && row.some((cell) => key(text(cell)) === "player"));
  if (headerIndex < 0) return [];
  const headers = grid[headerIndex].map((cell) => key(text(cell)));
  return grid.slice(headerIndex + 1).filter((row) => row.some((cell) => text(cell))).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ ok: false, error: "Upload the Career Stats .xlsx workbook." }, { status: 400 });
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" }); }
  catch { return NextResponse.json({ ok: false, error: "That workbook could not be read." }, { status: 400 }); }
  const rawSheetName = workbook.SheetNames.find((name) => key(name).includes("rawhole"));
  if (!rawSheetName) return NextResponse.json({ ok: false, error: "The workbook needs a Raw Hole-by-Hole sheet." }, { status: 400 });
  const holes = toObjects(workbook.Sheets[rawSheetName]).map((row) => {
    const year = number(findValue(row, "year")); const round = number(findValue(row, "round")); const hole = number(findValue(row, "hole")); const par = number(findValue(row, "par")); const yards = number(findValue(row, "yards")); const score = number(findValue(row, "score"));
    return { year, player: text(findValue(row, "player")), round, day: text(findValue(row, "day")) || null, course: text(findValue(row, "course")), hole, par, yards, hole_type: text(findValue(row, "holetype")) || null, hole_length_bucket: text(findValue(row, "holelengthbucket")) || null, course_length: number(findValue(row, "courselength")), course_length_bucket: text(findValue(row, "courselengthbucket")) || null, score, diff_vs_par: score != null && par != null ? score - par : null, score_type: score != null && par != null ? scoreType(score, par) : null, format: text(findValue(row, "format")) || null };
  }).filter((row) => row.year != null && row.player && row.round != null && row.course && row.hole != null && row.par != null && row.yards != null && row.score != null);
  if (!holes.length) return NextResponse.json({ ok: false, error: "No valid hole-by-hole rows were found in that workbook." }, { status: 400 });
  const partnershipSheetName = workbook.SheetNames.find((name) => key(name).includes("partnership"));
  const partnerships = partnershipSheetName ? toObjects(workbook.Sheets[partnershipSheetName]).map((row) => ({ player: text(findValue(row, "player")), partner: text(findValue(row, "partner")), year: number(findValue(row, "year")), format: text(findValue(row, "format")) || null, result: text(findValue(row, "result", "outcome")).toLowerCase() })).filter((row): row is { player: string; partner: string; year: number; format: string | null; result: "win" | "loss" | "halve" } => row.player !== "" && row.partner !== "" && row.year != null && ["win", "loss", "halve"].includes(row.result)) : [];
  const service = createSupabaseServiceRoleClient();
  const { error: clearError } = await service.from("career_stat_holes").delete().gte("year", 0);
  if (clearError) return NextResponse.json({ ok: false, error: "Could not replace career data. Run the latest Supabase schema first." }, { status: 500 });
  await service.from("career_stat_partnerships").delete().gte("year", 0);
  await service.from("career_stats_workbook_sheets").delete().neq("sheet_name", "");
  for (let index = 0; index < holes.length; index += 500) { const { error } = await service.from("career_stat_holes").insert(holes.slice(index, index + 500)); if (error) return NextResponse.json({ ok: false, error: "The workbook rows could not be saved." }, { status: 500 }); }
  if (partnerships.length) await service.from("career_stat_partnerships").insert(partnerships);
  const sheets = workbook.SheetNames.map((sheetName) => ({ sheet_name: sheetName, source_file: file.name, imported_by: host.userId, sheet_data: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }) }));
  const { error: sheetError } = await service.from("career_stats_workbook_sheets").insert(sheets);
  if (sheetError) return NextResponse.json({ ok: false, error: "The workbook was imported, but its source-sheet backup could not be saved." }, { status: 500 });
  return NextResponse.json({ ok: true, holes: holes.length, partnerships: partnerships.length });
}
