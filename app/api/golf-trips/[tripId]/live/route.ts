import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { liveSettingsFromBody } from "@/lib/platform/liveVisibility";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * PATCH { visibility: "public" | "link" | "private", playersCanShare: boolean }
 * The Maroon Live, Step 1: the organizer changes who can watch the trip (supabase/maroon_live_visibility.sql).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return NextResponse.json({ ok: false, error: view.status === "signed-out" ? "Log in first." : "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 });
  if (!view.viewer.isOrganizer) return NextResponse.json({ ok: false, error: "Only the organizer can change who can watch." }, { status: 403 });
  const parsed = liveSettingsFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.message }, { status: 400 });
  const { error } = await createSupabaseServiceRoleClient().rpc("set_live_visibility", {
    p_profile: view.viewer.profileId, p_kind: "trip", p_id: tripId, p_visibility: parsed.settings.visibility, p_players_can_share: parsed.settings.playersCanShare,
  });
  if (error) {
    // supabase/maroon_live_visibility.sql not run in this database yet.
    if (["PGRST202", "42883"].includes(error.code)) return NextResponse.json({ ok: false, error: "Who can watch isn't switched on yet." }, { status: 503 });
    if (error.code === "42501") return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    if (error.code === "22023") return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Couldn't save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
