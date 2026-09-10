import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { mergeCourseCsv } from "@/lib/live/courseCsv";

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body?.id !== "string" || typeof body.csv !== "string" || body.csv.length > 1000000) throw new Error("Choose a CSV file under 1 MB.");
    const service = createSupabaseServiceRoleClient();
    const { data: course, error } = await service.from("live_courses").select("id,name,holes,rating,slope,tee_sets").eq("id", body.id).maybeSingle();
    if (error || !course) throw new Error("Could not load the saved course.");
    const tees = mergeCourseCsv(body.csv, Array.isArray(course.tee_sets) ? course.tee_sets : []);
    const primary = tees[0];
    const { data, error: saveError } = await service.from("live_courses").update({ tee_sets: tees, holes: primary.holes, rating: primary.rating, slope: primary.slope }).eq("id", course.id).select("id");
    if (saveError || !data?.length) throw new Error("The course changed or could not be saved. Refresh and try again.");
    return NextResponse.json({ ok: true, course: { ...course, holes: primary.holes, rating: primary.rating, slope: primary.slope, teeSets: tees } });
  } catch (err) { return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "CSV import failed." }, { status: 400 }); }
}
