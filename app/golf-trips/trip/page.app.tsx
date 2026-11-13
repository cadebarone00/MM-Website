"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SavedGolfTripHome } from "@/components/platform/SavedGolfTripHome";
import { ImportedGolfTripHome } from "@/components/platform/ImportedGolfTripHome";
import { golfTripUrl, savedTripAsDraft } from "@/lib/platform/golfTripCreate";
import type { TripPageData } from "@/lib/platform/tripPageData";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → a trip (/golf-trips/trip/?id=…&round=…): the website's trip page, with the same data from /api/app/golf-trips/<id>. */
function AppTrip() {
  const params = useSearchParams();
  const tripId = params.get("id") ?? "";
  const round = params.get("round");
  const [state, reload] = useAppData<TripPageData>(tripId ? `/api/app/golf-trips/${encodeURIComponent(tripId)}${round ? `?round=${encodeURIComponent(round)}` : ""}` : null);
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const data = state.data;
  if (data.status === "imported") return <ImportedGolfTripHome savedTrip={data.savedTrip} view={data.view}
    editing={data.editing ? { ...data.editing, endpoint: `/api/golf-trips/${tripId}/imported-results` } : undefined} />;
  if (data.status !== "live") return <AppStatus state={{ status: "error", error: "Trip not found.", code: 404 }} onRetry={reload} />;
  const { savedTrip, viewer } = data;
  return <SavedGolfTripHome tips={{ profileId: viewer.profileId, isOrganizer: viewer.isOrganizer }} planSnapshot={data.planSnapshot} setupSnapshot={data.setupSnapshot}
    savedTrip={savedTrip} preview={savedTripAsDraft(savedTrip)} settingsHref={golfTripUrl(tripId, "settings")} backHref="/golf-trips/"
    alertScope={{ tripId, profileId: viewer.profileId, isOrganizer: viewer.isOrganizer }} flights={{ summary: data.flightSummary, href: golfTripUrl(tripId, "flights") }}
    scoring={data.scoring ?? undefined} />;
}

export default function AppTripPage() {
  return <Suspense><AppTrip /></Suspense>;
}
