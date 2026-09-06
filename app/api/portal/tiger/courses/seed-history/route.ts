import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { historicalCourseLibrary } from "@/lib/live/historicalCourseLibrary";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** One-time, idempotent import of the corrected 2024–2026 course setups. */
export async function POST() {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const service = createSupabaseServiceRoleClient();
  const library = historicalCourseLibrary();
  const { data: existing, error: loadError } = await service.from("live_courses").select("name");
  if (loadError) return NextResponse.json({ ok: false, error: "Could not read the course library." }, { status: 500 });
  const names = new Set((existing ?? []).map((course) => String(course.name).trim().toLowerCase()));
  const missing = library.filter((course) => !names.has(course.name.toLowerCase()));
  if (missing.length) {
    const { error } = await service.from("live_courses").insert(missing);
    if (error) return NextResponse.json({ ok: false, error: "Could not import the historical courses." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, added: missing.length, total: library.length });
}
