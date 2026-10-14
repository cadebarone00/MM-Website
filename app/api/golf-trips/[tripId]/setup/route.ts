import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { loadSavedTripSetup } from "@/lib/platform/savedTripSetupServer";
import { setupPlan, validSetup } from "@/lib/platform/savedTripSetup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return NextResponse.json({ error: "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 });
  if (!view.viewer.isOrganizer) return NextResponse.json({ error: "Only the organizer can change trip setup." }, { status: 403 });
  const text = await request.text();
  if (text.length > 300000) return NextResponse.json({ error: "Settings are too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid settings." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !validSetup(body.values) || !Number.isInteger(body.revision) || body.revision < 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.writeId ?? "")) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  const snapshot = await loadSavedTripSetup(view.trip);
  if (!snapshot.available) return NextResponse.json({ error: "Trip setup storage is not installed yet." }, { status: 503 });
  try {
    const plan = setupPlan(view.trip, snapshot.basis, body.values);
    const { data, error } = await createSupabaseServiceRoleClient().rpc("save_golf_trip_setup", {
      p_profile: view.viewer.profileId, p_trip: tripId, p_revision: body.revision, p_write: body.writeId, p_settings: body.values,
      p_basis: snapshot.basis, p_arrival: plan.arrival, p_departure: plan.departure, p_capacity: plan.capacity, p_rounds: plan.rounds,
    });
    if (error) return NextResponse.json({ error: ["40001", "42501", "22023"].includes(error.code) ? error.message : "Couldn't save trip settings." }, { status: error.code === "40001" ? 409 : error.code === "42501" ? 403 : 400 });
    return NextResponse.json({ ok: true, revision: data.revision });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid settings." }, { status: 400 }); }
}
