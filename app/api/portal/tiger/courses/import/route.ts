import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireHost } from "@/lib/portal/requireHost";
import type { LiveHole } from "@/lib/live/types";

export const runtime = "nodejs";

type CourseDraft = { name: string | null; holes: LiveHole[]; rating: number | null; slope: number | null };

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function label(row: unknown[]): string {
  return row.map((cell) => String(cell ?? "")).join(" ").toLowerCase();
}

function draftFromRows(rows: unknown[][], filename: string): CourseDraft {
  const fallbackName = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || null;
  const holeRowIndex = rows.findIndex((row) => {
    const values = row.map(numberValue);
    return Array.from({ length: 18 }, (_, index) => values.includes(index + 1)).filter(Boolean).length >= 15;
  });
  const holeRow = holeRowIndex >= 0 ? rows[holeRowIndex] : [];
  const holeColumns = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, column: holeRow.findIndex((cell) => numberValue(cell) === index + 1) }));
  const parRow = rows.find((row) => /\bpar\b/.test(label(row))) ?? [];
  const yardsRow = rows.find((row) => /yard|distance/.test(label(row))) ?? [];
  const valueAt = (row: unknown[], column: number) => column >= 0 ? numberValue(row[column]) : null;

  const holes = holeColumns.map(({ number, column }) => ({
    number,
    par: valueAt(parRow, column) ?? 4,
    yards: valueAt(yardsRow, column) ?? 0,
  }));
  const ratingRow = rows.find((row) => /course\s*rating|\brating\b/.test(label(row))) ?? [];
  const slopeRow = rows.find((row) => /\bslope\b/.test(label(row))) ?? [];
  const firstNumeric = (row: unknown[]) => row.map(numberValue).find((value): value is number => value !== null) ?? null;

  return { name: fallbackName, holes, rating: firstNumeric(ratingRow), slope: firstNumeric(slopeRow) };
}

function parseModelDraft(text: string, filename: string): CourseDraft {
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const candidate = JSON.parse(json) as Partial<CourseDraft>;
  const imported = new Map((candidate.holes ?? []).map((hole) => [Number(hole.number), hole]));
  return {
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : filename.replace(/\.[^.]+$/, "") || null,
    holes: Array.from({ length: 18 }, (_, index) => {
      const hole = imported.get(index + 1);
      const par = numberValue(hole?.par);
      const yards = numberValue(hole?.yards);
      return { number: index + 1, par: par && par >= 3 && par <= 5 ? par : 4, yards: yards && yards >= 0 ? yards : 0 };
    }),
    rating: numberValue(candidate.rating),
    slope: numberValue(candidate.slope),
  };
}

async function analyzeVisualScorecard(file: File): Promise<CourseDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Scorecard photo import needs OPENAI_API_KEY configured on the server. Excel and CSV imports work without it.");

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const isImage = file.type.startsWith("image/");
  const content = isImage
    ? [{ type: "input_image", image_url: `data:${file.type};base64,${base64}`, detail: "high" }]
    : [{ type: "input_file", filename: file.name, file_data: base64 }];
  const prompt = `Read this golf-course scorecard. Extract only facts you can see. Return strict JSON with this exact shape: {"name": string|null, "rating": number|null, "slope": number|null, "holes": [{"number":1,"par":number|null,"yards":number|null}]}. Include all holes 1 through 18. Use null for unreadable or missing values. Do not guess and do not include markdown.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_SCORECARD_MODEL ?? "gpt-5.6-luna",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...content] }],
    }),
  });
  const body = await response.json() as { output_text?: string; output?: { content?: { type?: string; text?: string }[] }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "The scorecard analysis service could not read that file.");
  const output = body.output_text ?? body.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("") ?? "";
  return parseModelDraft(output, file.name);
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("scorecard");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "Choose a scorecard picture, PDF, CSV, or Excel file." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ ok: false, error: "Scorecard files must be 10 MB or smaller." }, { status: 400 });

  try {
    const spreadsheet = /\.(csv|xlsx|xls)$/i.test(file.name);
    let draft: CourseDraft;
    if (spreadsheet) {
      const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      draft = draftFromRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }), file.name);
    } else {
      draft = await analyzeVisualScorecard(file);
    }
    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not read that scorecard file." }, { status: 422 });
  }
}
