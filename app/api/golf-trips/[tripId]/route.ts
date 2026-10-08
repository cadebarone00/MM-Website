import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";

/**
 * Delete Golf Trip (Trip Settings → Organizer): removes the whole trip, its members and rounds. Only the
 * trip's organizer can; players keep their own accounts. A missing trip and someone else's trip get the
 * same 404, so a stranger learns nothing.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to delete this trip." }, { status: 401 });
  if (current.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });

  const { tripId } = await params;
  if (!isGolfTripId(tripId)) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });

  const { data, error } = await createSupabaseServiceRoleClient().rpc("delete_golf_trip", { p_profile: current.profile.profileId, p_trip: tripId });
  if (error) {
    // Function not installed yet (the delete step of supabase/golf_trips.sql not run in this database).
    if (error.code === "PGRST202" || error.code === "42883") {
      return NextResponse.json({ ok: false, error: "Deleting golf trips isn't switched on yet." }, { status: 503 });
    }
    console.error("delete_golf_trip failed:", error.message);
    return NextResponse.json({ ok: false, error: "We couldn't delete this trip. Try again." }, { status: 500 });
  }
  if (data !== true) return NextResponse.json({ ok: false, error: "This trip couldn't be found, or you're not its organizer." }, { status: 404 });

  return NextResponse.json({ ok: true, url: "/golf-trips" });
}
