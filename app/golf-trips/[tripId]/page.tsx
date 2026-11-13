import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SavedGolfTripHome } from "@/components/platform/SavedGolfTripHome";
import { ImportedGolfTripHome } from "@/components/platform/ImportedGolfTripHome";
import { golfTripUrl, savedTripAsDraft } from "@/lib/platform/golfTripCreate";
import { loadTripPageData } from "@/lib/platform/tripPageData";

export const metadata: Metadata = { title: "Golf Trip | The Maroon" };

/**
 * Golf Trip Home: the one canonical page for a saved trip, whether it was just created, refreshed, reopened
 * or picked from My Trips. Rebuilt from Supabase on every request (never from the questionnaire draft).
 * Members only: a stranger sees the same "not found" as a trip that doesn't exist. The data comes from
 * loadTripPageData, the same loader the iPhone / Android app reads through /api/app/golf-trips/<id>.
 * Weather is turned off: the app will use the phone's own weather (e.g. Apple Weather on iOS) instead.
 */
export default async function SavedGolfTripPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ round?: string }> }) {
  const { tripId } = await params;
  // ?round=<n>: a round already played (opened from Trip Settings → Corrections), read-only unless a correction reopens it.
  const askedRound = Number((await searchParams).round) || undefined;
  const data = await loadTripPageData(tripId, askedRound);
  if (data.status === "signed-out") redirect("/login");
  if (data.status === "not-found") notFound();
  if (data.status === "imported") return <ImportedGolfTripHome savedTrip={data.savedTrip} view={data.view}
    editing={data.editing ? { ...data.editing, endpoint: `/api/golf-trips/${tripId}/imported-results` } : undefined} />;
  const { savedTrip, viewer } = data;
  // GolfTripHome reads questionnaire-shaped answers; the saved trip is passed in that shape.
  return <SavedGolfTripHome tips={{ profileId: viewer.profileId, isOrganizer: viewer.isOrganizer }} planSnapshot={data.planSnapshot} setupSnapshot={data.setupSnapshot}
    savedTrip={savedTrip} preview={savedTripAsDraft(savedTrip)} settingsHref={golfTripUrl(tripId, "settings")} backHref="/golf-trips"
    alertScope={{ tripId, profileId: viewer.profileId, isOrganizer: viewer.isOrganizer }} flights={{ summary: data.flightSummary, href: golfTripUrl(tripId, "flights") }}
    scoring={data.scoring ?? undefined} />;
}
