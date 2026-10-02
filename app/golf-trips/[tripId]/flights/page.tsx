import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GolfTripFlights } from "@/components/platform/GolfTripFlights";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import { getGolfTrip, getMyGolfTripFlights } from "@/lib/platform/golfTripsServer";

export const metadata: Metadata = { title: "Flights | The Maroon" };

/** Golf Trip Info → Flights: the signed-in member's own flights on this trip. Same access as the trip itself. */
export default async function GolfTripFlightsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status === "not-found") notFound();

  const mine = await getMyGolfTripFlights(tripId);
  return <GolfTripFlights tripId={tripId} backHref={golfTripUrl(tripId)}
    initialFlights={mine.status === "ok" ? mine.flights : []} available={mine.status === "ok"} />;
}
