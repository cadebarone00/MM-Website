"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GolfTripFlights } from "@/components/platform/GolfTripFlights";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import type { TripFlightsData } from "@/lib/platform/tripPageData";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → a trip → Flights: your own flights on the trip. */
function AppTripFlights() {
  const tripId = useSearchParams().get("id") ?? "";
  const [state, reload] = useAppData<TripFlightsData>(tripId ? `/api/app/golf-trips/${encodeURIComponent(tripId)}?view=flights` : null);
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const data = state.data;
  if (data.status !== "ok") return <AppStatus state={{ status: "error", error: "Trip not found.", code: 404 }} onRetry={reload} />;
  return <GolfTripFlights tripId={tripId} backHref={golfTripUrl(tripId)} initialFlights={data.flights} available={data.available} />;
}

export default function AppTripFlightsPage() {
  return <Suspense><AppTripFlights /></Suspense>;
}
