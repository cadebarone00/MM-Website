import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LiveCourse, LiveHole, LiveTeeSet } from "@/lib/live/types";

import { validTeeSets } from "@/lib/live/teeSets";

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

export async function PUT(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const { id, teeSets } = await request.json();
  if (typeof id !== "string" || !Array.isArray(teeSets) || (teeSets.length > 0 && !validTeeSets(teeSets))) return NextResponse.json({ ok: false, error: "Enter a name, valid color, and holes 1–18 with par and yardage. Locked tees also require positive yardages, rating, and slope (55–155)." }, { status: 400 });
  const primary = teeSets[0];
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_courses").update({ tee_sets: teeSets, ...(primary ? { holes: primary.holes, rating: primary.rating, slope: primary.slope } : { rating: null, slope: null }) }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Could not save tee sets. Run the Course Library SQL migration first." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  let body: { id?: unknown; confirmationName?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body.id !== "string" || typeof body.confirmationName !== "string") return NextResponse.json({ ok: false, error: "Type the course name to confirm deletion." }, { status: 400 });
  const service = createSupabaseServiceRoleClient();
  const { data: course, error: lookupError } = await service.from("live_courses").select("id, name").eq("id", body.id).maybeSingle();
  if (lookupError) return NextResponse.json({ ok: false, error: "Could not load the course. Try again." }, { status: 500 });
  if (!course) return NextResponse.json({ ok: false, error: "Course not found. Refresh the library." }, { status: 404 });
  if (body.confirmationName !== course.name) return NextResponse.json({ ok: false, error: "The name must match the course name exactly." }, { status: 400 });
  // Foreign keys prevent deleting a course referenced by scores or round setups.
  const { data: deleted, error } = await service.from("live_courses").delete().eq("id", course.id).eq("name", body.confirmationName).select("id");
  if (error) return NextResponse.json({ ok: false, error: error.code === "23503" ? "This course is used by saved scores or tournament rounds and cannot be deleted." : "Could not delete the course. Please try again." }, { status: error.code === "23503" ? 409 : 500 });
  if (!deleted?.length) return NextResponse.json({ ok: false, error: "The course changed. Refresh the library and try again." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
