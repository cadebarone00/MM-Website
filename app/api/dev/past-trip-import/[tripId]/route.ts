import { NextResponse } from "next/server";
import { samplePastTrip, samplePastTripResults, samplePastTripRevision, updateSamplePastTrip } from "@/lib/dev/samplePastTrips";
import { applyResultChanges, resultChangesFromJson } from "@/lib/platform/pastTripModel";

/**
 * App simulator only: fix a sample imported trip's results with the real rules (lib/platform/pastTripModel.ts), in the
 * dev server's memory. `?as=<member row>`: who you're viewing as (the organizer by default, or a player for "view as a player").
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const { tripId } = await params;
  const trip = samplePastTrip(tripId), results = samplePastTripResults(tripId);
  const body = await request.json().catch(() => null) as { revision?: unknown; changes?: unknown } | null;
  const changes = resultChangesFromJson(body?.changes);
  if (!trip || !results || !body || !changes) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  if (body.revision !== samplePastTripRevision(tripId)) return NextResponse.json({ ok: false, error: "Someone else just changed these results. Reload and try again." }, { status: 409 });
  const organizerRow = trip.members.find((m) => m.role === "organizer")!.id;
  const asked = new URL(request.url).searchParams.get("as");
  const as = asked && trip.members.some((m) => m.id === asked) ? asked : organizerRow;
  const applied = applyResultChanges(results, changes, { memberId: as, organizer: as === organizerRow }, new Date().toISOString().slice(0, 10));
  if (!applied.ok) return NextResponse.json({ ok: false, error: applied.error }, { status: 400 });
  return NextResponse.json({ ok: true, revision: updateSamplePastTrip(tripId, applied.trip), results: applied.trip });
}
