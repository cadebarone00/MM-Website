import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolfTripSettings } from "@/components/platform/GolfTripSettings";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";

export const metadata: Metadata = { title: "Trip Settings | The Maroon" };

/**
 * Trip Settings for a saved trip. Same access as the trip itself (members only). Members are passed as the server
 * lets this viewer see them (other members' emails only for the organizer). The organizer also gets the Organizer
 * settings (manage members and invitations, Delete Trip).
 */
export default async function SavedGolfTripSettingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status === "not-found") notFound();

  return <GolfTripSettings backHref={golfTripUrl(tripId)} isOrganizer={view.viewer.isOrganizer} tripId={tripId}
    members={view.trip.members} viewerMemberId={view.viewer.memberId} profileId={view.viewer.profileId} />;
}
