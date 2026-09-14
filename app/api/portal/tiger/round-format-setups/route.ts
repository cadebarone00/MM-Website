import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildArchiveTeeSetup, mapCourseRow } from "@/lib/handicap/data";
import { getRoundFormatSetups, saveRoundFormatSetup } from "@/lib/data/roundFormatSetups";

export async function GET() {
  if (!await requireHost()) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json({ ok: true, setups: await getRoundFormatSetups() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const input = await request.json().catch(() => null);
  if (!input || !Number.isInteger(input.seasonYear) || input.seasonYear < 2000 || input.seasonYear > 2200
    || !Number.isInteger(input.round) || input.round < 0 || typeof input.courseId !== "string" || typeof input.teeSetId !== "string"
    || typeof input.datePlayed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.datePlayed)
    || !Number.isFinite(Date.parse(input.datePlayed)) || new Date(input.datePlayed).toISOString().slice(0, 10) !== input.datePlayed) {
    return NextResponse.json({ ok: false, error: "Choose the year, round, course, tees, and valid date played." }, { status: 400 });
  }
  const service = createSupabaseServiceRoleClient();
  const { data: course, error } = await service.from("live_courses").select("id, name, tee_sets").eq("id", input.courseId).maybeSingle();
  if (error || !course) return NextResponse.json({ ok: false, error: "Course not found." }, { status: 400 });
  const teeSetup = buildArchiveTeeSetup(mapCourseRow(course), input.teeSetId);
  if (!teeSetup) return NextResponse.json({ ok: false, error: "Choose a saved, locked tee set with rating and slope." }, { status: 400 });
  try {
    await saveRoundFormatSetup({ seasonYear: input.seasonYear, round: input.round, courseName: course.name, datePlayed: input.datePlayed, teeSetup });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save setup." }, { status: 503 });
  }
}
