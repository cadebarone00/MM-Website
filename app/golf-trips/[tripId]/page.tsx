import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { golfTripUrl, savedTripAsDraft } from "@/lib/platform/golfTripCreate";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";

export const metadata: Metadata = { title: "Golf Trip | The Maroon" };

/**
 * Golf Trip Home: the one canonical page for a saved trip, whether it was just created, refreshed, reopened
 * or picked from My Trips. Rebuilt from Supabase on every request (never from the questionnaire draft).
 * Members only: a stranger sees the same "not found" as a trip that doesn't exist.
 * `view.viewer` says whether the signed-in person is the organizer or a member, for UI that needs it.
 */
export default async function SavedGolfTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status === "not-found") notFound();

  // GolfTripHome reads questionnaire-shaped answers; the saved trip is passed in that shape.
  return <GolfTripHome preview={savedTripAsDraft(view.trip)} settingsHref={`${golfTripUrl(tripId)}/settings`} backHref="/golf-trips" />;
}
