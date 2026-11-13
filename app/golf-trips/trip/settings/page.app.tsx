"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SavedTripSettingsWorkspace } from "@/components/platform/SavedTripSettingsWorkspace";
import { ImportedTripSettings } from "@/components/platform/ImportedTripSettings";
import type { TripSettingsData } from "@/lib/platform/tripPageData";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → a trip → Trip Settings (same screens as the website). */
function AppTripSettings() {
  const tripId = useSearchParams().get("id") ?? "";
  const [state, reload] = useAppData<TripSettingsData>(tripId ? `/api/app/golf-trips/${encodeURIComponent(tripId)}?view=settings` : null);
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const data = state.data;
  if (data.status !== "ok") return <AppStatus state={{ status: "error", error: "Trip not found.", code: 404 }} onRetry={reload} />;
  if (data.savedTrip.trip.imported) return <ImportedTripSettings trip={data.savedTrip} viewer={data.viewer} />;
  return <SavedTripSettingsWorkspace trip={data.savedTrip} viewer={data.viewer} snapshot={data.setupSnapshot} />;
}

export default function AppTripSettingsPage() {
  return <Suspense><AppTripSettings /></Suspense>;
}
