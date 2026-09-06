import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LiveCourse, LiveHole, LiveTeeSet } from "@/lib/live/types";

function validTeeSets(value: unknown): value is LiveTeeSet[] {
  return Array.isArray(value) && value.length > 0 && value.every((tee) => typeof tee?.id === "string" && typeof tee?.name === "string" && Array.isArray(tee?.holes) && tee.holes.length === 18 && tee.holes.every((hole: unknown) => typeof (hole as LiveHole)?.number === "number" && typeof (hole as LiveHole)?.par === "number" && typeof (hole as LiveHole)?.yards === "number"));
}

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").select("id, name, holes, rating, slope, tee_sets").order("name");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the course bank." }, { status: 500 });
  }

  const courses: LiveCourse[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    holes: row.holes as LiveHole[],
    rating: row.rating,
    slope: row.slope,
    teeSets: Array.isArray(row.tee_sets) ? row.tee_sets as LiveTeeSet[] : [],
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
    .insert({ name: name.trim(), holes, rating: rating ?? null, slope: slope ?? null, tee_sets: [{ id: "standard", name: "Standard", holes, rating: rating ?? null, slope: slope ?? null }] })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Could not save that course." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, courseId: data.id });
}

export async function PUT(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const { id, teeSets } = await request.json();
  if (typeof id !== "string" || !validTeeSets(teeSets)) return NextResponse.json({ ok: false, error: "Every tee set needs a name and exactly 18 holes." }, { status: 400 });
  const primary = teeSets[0];
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_courses").update({ tee_sets: teeSets, holes: primary.holes, rating: primary.rating, slope: primary.slope }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Could not save tee sets. Run the Course Library SQL migration first." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
