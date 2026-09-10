// app/api/portal/tiger/scorecards/archive-tees/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { assignArchiveTeeSetup } from "@/lib/data/archivedScorecards";
import { validateAssignArchiveTeesInput } from "@/lib/handicap/validate";
import { mapCourseRow, buildArchiveTeeSetup } from "@/lib/handicap/data";
import type { AssignArchiveTeesInput } from "@/lib/handicap/types";

/**
 * Tiger-only bulk action: assigns one tee set (and the date it was played)
 * to every player's archived row for one tournament + round at once — the
 * write path archived_scorecard_rounds never had, so its
 * handicap_setup/played_on columns stayed empty even after the migration
 * that added them.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const body = (await request.json()) as AssignArchiveTeesInput;
  const validation = validateAssignArchiveTeesInput(body);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: courseRow, error: courseError } = await service
    .from("live_courses")
    .select("id, name, tee_sets")
    .eq("id", body.courseId)
    .maybeSingle();
  if (courseError || !courseRow) {
    return NextResponse.json({ ok: false, error: "Course not found." }, { status: 400 });
  }

  const course = mapCourseRow(courseRow as { id: string; name: string; tee_sets: unknown });
  const teeSetup = buildArchiveTeeSetup(course, body.teeSetId);
  if (!teeSetup) {
    return NextResponse.json({ ok: false, error: "Tee set not found." }, { status: 400 });
  }

  const result = await assignArchiveTeeSetup(body.tournamentSlug, body.round, teeSetup, body.datePlayed);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
