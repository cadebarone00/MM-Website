import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { fetchGolfCourse, searchGolfCourses } from "@/lib/live/golfApi";
import { refreshGolfTees, normalizedCourseName } from "@/lib/live/golfApiMapping";
import type { LiveTeeSet } from "@/lib/live/types";

export async function GET(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.has("status")) return NextResponse.json({ ok: true, configured: true });
  const query = url.searchParams.get("q")?.trim() ?? "";
  const page = Number(url.searchParams.get("page") ?? 1);
  if (query.length < 2 || query.length > 120 || !Number.isInteger(page) || page < 1 || page > 1000) return NextResponse.json({ ok: false, error: "Enter at least two characters to search." }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...await searchGolfCourses(query, page) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Course search failed." }, { status: 502 }); }
}

export async function POST(request: Request) {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  let body: { providerId?: unknown; courseId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body.providerId !== "string" || !/^[a-z0-9][a-z0-9-]{0,199}$/.test(body.providerId) || body.courseId !== undefined && typeof body.courseId !== "string") return NextResponse.json({ ok: false, error: "Choose a course from search results." }, { status: 400 });
  const service = createSupabaseServiceRoleClient();
  try {
    const { data: linked, error: linkedError } = await service.from("live_courses").select("id").contains("tee_sets", [{ apiSource: { provider: "golfcore", courseId: body.providerId } }]).limit(1);
    if (linkedError) throw new Error("Could not check the Course Library.");
    if (linked?.length && body.courseId !== linked[0].id) throw new Error("This provider course is already saved. Use Refresh from API on its course card.");
    const imported = await fetchGolfCourse(body.providerId);
    if (!body.courseId) {
      const names: { id: string; name: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await service.from("live_courses").select("id, name").order("id").range(from, from + 999);
        if (error) throw new Error("Could not check existing course names.");
        names.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const candidates = [imported.name, ...imported.name.split(" — ")].map(normalizedCourseName);
      const matching = names.find((course) => candidates.includes(normalizedCourseName(course.name)));
      if (matching) throw new Error(`A saved course named ${matching.name} already exists. Select it under Save to existing course instead of creating a new course.`);
    }
    // A stable ID makes repeat/concurrent imports of the same provider course safe.
    const hash = createHash("sha256").update(`golfcore:${body.providerId}`).digest("hex");
    const id = typeof body.courseId === "string" ? body.courseId : `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const { data: existing, error: readError } = await service.from("live_courses").select("id, name, holes, rating, slope, tee_sets").eq("id", id).maybeSingle();
    if (readError) throw new Error("Could not read the Course Library.");
    if (body.courseId && !existing) throw new Error("The saved course no longer exists. Refresh the library.");
    const previous: LiveTeeSet[] = existing ? Array.isArray(existing.tee_sets) && existing.tee_sets.length ? existing.tee_sets : [{ id: "standard", name: "Standard", holes: existing.holes, rating: existing.rating, slope: existing.slope }] : [];
    if (previous.some((tee) => tee.apiSource?.provider === "golfcore" && tee.apiSource.courseId !== body.providerId)) throw new Error("This course is already linked to a different provider course.");
    const teeSets = refreshGolfTees(previous, imported.teeSets);
    const primary = teeSets[0];
    const name = existing?.name ?? imported.name;
    const fields = { name, tee_sets: teeSets, holes: primary.holes, rating: primary.rating, slope: primary.slope };
    if (existing) {
      // Do not overwrite a manual save made while the provider request was running.
      let update = service.from("live_courses").update(fields).eq("id", id);
      update = existing.tee_sets == null ? update.is("tee_sets", null) : update.eq("tee_sets", JSON.stringify(existing.tee_sets));
      const { data, error } = await update.select("id");
      if (error || !data?.length) throw new Error("The course changed or could not be saved. Refresh and try again.");
    } else {
      const { error } = await service.from("live_courses").insert({ id, ...fields });
      if (error) throw new Error(error.code === "23505" ? "This course was already imported. Refresh the library to see it." : "Could not save the imported course.");
    }
    return NextResponse.json({ ok: true, course: { id, name, holes: primary.holes, rating: primary.rating, slope: primary.slope, teeSets } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not import the course." }, { status: 400 }); }
}
