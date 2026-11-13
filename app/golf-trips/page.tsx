import type { Metadata } from "next";
import { getUserGolfTrips } from "@/lib/platform/golfTripsServer";
import { GolfTripsView } from "@/components/platform/GolfTripsView";

export const metadata: Metadata = { title: "Golf Trips | The Maroon" };

/**
 * Golf Trips (website). Loaded fresh from Supabase on every visit (getUserGolfTrips), so a deleted trip simply isn't
 * listed. The page itself is GolfTripsView, shared with the app.
 */
export default async function GolfTripsPage() {
  const result = await getUserGolfTrips();
  return <GolfTripsView result={result.status === "ok" ? { status: "ok", trips: result.trips } : { status: result.status === "signed-out" ? "signed-out" : "unavailable" }} />;
}
