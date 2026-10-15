import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { validPrivateTravel } from "@/lib/platform/savedTripTravel";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return NextResponse.json({ error: "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 });
  const text = await request.text();
  if (text.length > 120000) return NextResponse.json({ error: "Plans are too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid plans." }, { status: 400 }); }
  if (!body || !validPrivateTravel(body.travel, view.viewer.memberId) || !Number.isInteger(body.revision) || !/^[0-9a-f-]{36}$/i.test(body.writeId ?? "")) return NextResponse.json({ error: "Invalid plans." }, { status: 400 });
  const { data, error } = await createSupabaseServiceRoleClient().rpc("save_golf_trip_personal_plans", { p_profile: view.viewer.profileId, p_trip: tripId, p_revision: body.revision, p_write: body.writeId, p_payload: { items: body.travel.items, participants: body.travel.participants } });
  if (error) return NextResponse.json({ error: error.code === "40001" ? "Plans changed on another device. Reload before editing." : "Couldn't save plans." }, { status: error.code === "40001" ? 409 : 400 });
  return NextResponse.json({ ok: true, revision: data.revision });
}
