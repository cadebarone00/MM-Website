import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { COURSE_CSV_MAX_BYTES, parseCourseCsv, mergeCourseTees } from "@/lib/live/courseCsv";
import type { LiveTeeSet } from "@/lib/live/types";

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  let parsed: ReturnType<typeof parseCourseCsv>;
  let courseId: string | null = null;
  try {
    const form = await request.formData();
    const target = form.get("courseId");
    if (target !== null && (typeof target !== "string" || !target)) throw new Error("Invalid course.");
    courseId = target as string | null;
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
    if (file.size > COURSE_CSV_MAX_BYTES) throw new Error("CSV files must be 1 MB or smaller.");
    parsed = parseCourseCsv(await file.text(), file.name.replace(/\.csv$/i, "").trim() || "Imported course", !!courseId);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Could not read the CSV." }, { status: 400 });
  }
  const service = createSupabaseServiceRoleClient();
  if (courseId) {
    const { data: course, error: readError } = await service.from("live_courses").select("id, name, holes, rating, slope, tee_sets").eq("id", courseId).maybeSingle();
    if (readError || !course) return NextResponse.json({ ok: false, error: "Could not find the saved course. Refresh and try again." }, { status: 404 });
    const existing: LiveTeeSet[] = Array.isArray(course.tee_sets) && course.tee_sets.length ? course.tee_sets : [{ id: "standard", name: "Standard", holes: course.holes, rating: course.rating, slope: course.slope }];
    const teeSets = mergeCourseTees(existing, parsed.teeSets);
    const primary = teeSets[0];
    const { data, error } = await service.from("live_courses").update({ tee_sets: teeSets, holes: primary.holes, rating: primary.rating, slope: primary.slope }).eq("id", courseId).select("id").single();
    if (error || !data) return NextResponse.json({ ok: false, error: "Could not update the course. Try again." }, { status: 500 });
    return NextResponse.json({ ok: true, course: { id: course.id, name: course.name, holes: primary.holes, rating: primary.rating, slope: primary.slope, teeSets } });
  }
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
