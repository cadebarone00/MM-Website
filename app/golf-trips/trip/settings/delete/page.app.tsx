"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DeleteTrip } from "@/components/platform/GolfTripSettings";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import type { TripSettingsData } from "@/lib/platform/tripPageData";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";
import styles from "@/components/platform/GolfTripHome.module.css";

/** App → a trip → Trip Settings → Delete Trip (organizer only, same as the website). */
function AppDeleteTrip() {
  const tripId = useSearchParams().get("id") ?? "";
  const [state, reload] = useAppData<TripSettingsData>(tripId ? `/api/app/golf-trips/${encodeURIComponent(tripId)}?view=settings` : null);
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const data = state.data;
  if (data.status !== "ok" || !data.viewer.isOrganizer) return <AppStatus state={{ status: "error", error: "Trip not found.", code: 404 }} onRetry={reload} />;
  return <main className={styles.page}><Link href={golfTripUrl(tripId, "settings")}>Back to settings</Link><h1>Delete {data.savedTrip.trip.name}</h1><DeleteTrip tripId={tripId} /></main>;
}

export default function AppDeleteTripPage() {
  return <Suspense><AppDeleteTrip /></Suspense>;
}
