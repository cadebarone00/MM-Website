import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getGolfTrip, getImportedTrip } from "@/lib/platform/golfTripsServer";
import { applyResultChanges, resultChangesFromJson } from "@/lib/platform/pastTripModel";

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/**
 * Fix an imported trip's results (supabase/golf_trip_import_edits.sql). Body: { revision, changes }. A player may change
 * only their own scores; the organizer any score or match winner. The new results are worked out and checked here, then
 * update_imported_trip_results checks who may change what again, refuses a stale revision and records the change.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status === "signed-out") return fail(401, "Log in to change results.");
  if (view.status === "not-found") return fail(404, "Trip not found.");
  const saved = await getImportedTrip(tripId, view.viewer.profileId);
  if (!saved) return fail(404, "Trip not found.");
  if (saved.revision === 0) return fail(409, "Fixing results isn't switched on yet.");
  const body = await request.json().catch(() => null) as { revision?: unknown; changes?: unknown } | null;
  const changes = resultChangesFromJson(body?.changes);
  if (!body || !changes || !Number.isInteger(body.revision)) return fail(400, "Invalid request.");
  const applied = applyResultChanges(saved.trip, changes, { memberId: view.viewer.memberId, organizer: view.viewer.isOrganizer }, new Date().toISOString().slice(0, 10));
  if (!applied.ok) return fail(applied.error === "You can only change your own scores." ? 403 : 400, applied.error);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("update_imported_trip_results", {
    p_profile: view.viewer.profileId, p_trip: tripId, p_revision: body.revision, p_changes: changes, p_results: applied.trip,
  });
  if (error) {
    if (error.code === "40001") return fail(409, error.message);
    if (error.code === "42501") return fail(403, "You can only change your own scores.");
    console.error("update_imported_trip_results failed:", error.message);
    return fail(500, "We couldn't save that. Try again.");
  }
  return NextResponse.json({ ok: true, revision: data, results: applied.trip });
}
