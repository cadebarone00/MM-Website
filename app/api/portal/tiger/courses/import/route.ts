import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { COURSE_CSV_MAX_BYTES, parseCourseCsv } from "@/lib/live/courseCsv";

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  let parsed: ReturnType<typeof parseCourseCsv>;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
    if (file.size > COURSE_CSV_MAX_BYTES) throw new Error("CSV files must be 1 MB or smaller.");
    parsed = parseCourseCsv(await file.text(), file.name.replace(/\.csv$/i, "").trim() || "Imported course");
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Could not read the CSV." }, { status: 400 });
  }
  const service = createSupabaseServiceRoleClient();
  const { data: existing, error: lookupError } = await service.from("live_courses").select("id, name");
  if (lookupError) return NextResponse.json({ ok: false, error: "Could not check the Course Library. Try again." }, { status: 500 });
  if (existing?.some((course) => course.name.trim().toLowerCase() === parsed.name.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "A course with this name already exists. Edit it in the Course Library, or use a distinct course name in the CSV." }, { status: 409 });
  }
  const primary = parsed.teeSets[0];
  const { data, error } = await service.from("live_courses").insert({ name: parsed.name, holes: primary.holes, rating: primary.rating, slope: primary.slope, tee_sets: parsed.teeSets }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not save the imported course. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true, course: { id: data.id, name: parsed.name, holes: primary.holes, rating: primary.rating, slope: primary.slope, teeSets: parsed.teeSets } });
}
