import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LiveCourse, LiveHole } from "@/lib/live/types";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").select("id, name, holes, rating, slope").order("name");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the course bank." }, { status: 500 });
  }

  const courses: LiveCourse[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    holes: row.holes as LiveHole[],
    rating: row.rating,
    slope: row.slope,
  }));
  return NextResponse.json({ ok: true, courses }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { name, holes, rating, slope } = await request.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, error: "Course name is required." }, { status: 400 });
  }
  if (!Array.isArray(holes) || holes.length !== 18) {
    return NextResponse.json({ ok: false, error: "A course needs exactly 18 holes." }, { status: 400 });
  }
  for (const hole of holes) {
    if (typeof hole?.number !== "number" || typeof hole?.par !== "number" || typeof hole?.yards !== "number") {
      return NextResponse.json({ ok: false, error: "Every hole needs a number, par, and yardage." }, { status: 400 });
    }
  }
  if (rating !== undefined && rating !== null && typeof rating !== "number") {
    return NextResponse.json({ ok: false, error: "Course rating must be a number." }, { status: 400 });
  }
  if (slope !== undefined && slope !== null && (typeof slope !== "number" || !Number.isInteger(slope) || slope < 55 || slope > 155)) {
    return NextResponse.json({ ok: false, error: "Slope rating must be a whole number between 55 and 155." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("live_courses")
    .insert({ name: name.trim(), holes, rating: rating ?? null, slope: slope ?? null })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Could not save that course." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, courseId: data.id });
}
