"use client";
import { GolfTripsView, type GolfTripsResult } from "@/components/platform/GolfTripsView";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";
import type { GolfTripSummary } from "@/lib/platform/golfTripCreate";

/** App → Golf Trips: the website's page, with your trips from the live server (GET /api/golf-trips). */
export default function AppGolfTrips() {
  const [state, reload] = useAppData<{ trips: GolfTripSummary[] }>("/api/golf-trips");
  if (state.status === "loading") return <AppStatus state={state} onRetry={reload} />;
  const result: GolfTripsResult = state.status === "ok" ? { status: "ok", trips: state.data.trips } : state.code === 401 ? { status: "signed-out" } : { status: "unavailable" };
  return <GolfTripsView result={result} />;
}
