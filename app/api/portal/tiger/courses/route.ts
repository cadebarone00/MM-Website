import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LiveCourse, LiveHole, LiveTeeSet } from "@/lib/live/types";
import { US_STATE_CODES } from "@/lib/data/usStates";

import { validTeeSets } from "@/lib/live/teeSets";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").select("id, name, holes, rating, slope, tee_sets, city, state, zip_code").order("name");
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
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
  }));
  return NextResponse.json({ ok: true, courses }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) return NextResponse.json({ ok: false, error: "Enter a course name between 1 and 200 characters." }, { status: 400 });
    const service = createSupabaseServiceRoleClient();
    const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 0, yards: 0 }));
    const { data, error } = await service.from("live_courses").insert({ id: crypto.randomUUID(), name, holes, tee_sets: [], rating: null, slope: null }).select("id,name,holes,rating,slope").single();
    if (error) throw new Error("Could not create the course. Please try again.");
    return NextResponse.json({ ok: true, course: { ...data, teeSets: [] } });
  } catch (err) { return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Invalid request." }, { status: 400 }); }
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

export async function PATCH(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  let body: { id?: unknown; name?: unknown; city?: unknown; state?: unknown; zipCode?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  if (typeof body?.id !== "string") return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  // Only change the fields the caller sent (name via CourseNameEditor, location via
  // CourseLocationEditor); IDs, provider metadata and score references stay intact.
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 200) return NextResponse.json({ ok: false, error: "Enter a course name between 1 and 200 characters." }, { status: 400 });
    update.name = name;
  }
  if (body.city !== undefined || body.state !== undefined || body.zipCode !== undefined) {
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
    const zipCode = typeof body.zipCode === "string" ? body.zipCode.trim() : "";
    if (city.length > 100) return NextResponse.json({ ok: false, error: "City is too long." }, { status: 400 });
    if (state && !US_STATE_CODES.has(state)) return NextResponse.json({ ok: false, error: "Choose a valid state." }, { status: 400 });
    if (zipCode.length > 10) return NextResponse.json({ ok: false, error: "Zip code is too long." }, { status: 400 });
    update.city = city || null;
    update.state = state || null;
    update.zip_code = zipCode || null;
  }
  if (!Object.keys(update).length) return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").update(update).eq("id", body.id).select("id, name, city, state, zip_code").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not save the course. Please try again." }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Course not found. Refresh the library." }, { status: 404 });
  return NextResponse.json({ ok: true, course: { id: data.id, name: data.name, city: data.city, state: data.state, zipCode: data.zip_code } });
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
