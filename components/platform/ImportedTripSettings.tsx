"use client";
import Link from "next/link";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { GolfTripMembers, LeaveGolfTrip } from "./GolfTripMembers";
import styles from "./GolfTripHome.module.css";

/**
 * Trip Settings for an imported past trip: only Members (the organizer sends each player a New invite link, which
 * attaches their account to their name on the trip) and Delete Trip. The trip's setup came from the spreadsheet and
 * isn't edited here: to fix it, delete the trip and import it again.
 */
export function ImportedTripSettings({ trip, viewer }: { trip: SavedGolfTrip; viewer: { isOrganizer: boolean; memberId: string } }) {
  const tripId = trip.trip.id;
  return <main className={styles.page}>
    <Link href={`/golf-trips/${tripId}`}>Back to {trip.trip.name}</Link>
    <h1>Trip Settings</h1>
    <GolfTripMembers tripId={tripId} members={trip.members} viewerMemberId={viewer.memberId} manage={viewer.isOrganizer} />
    {viewer.isOrganizer
      ? <p><Link href={`/golf-trips/${tripId}/settings/delete`}>Delete Trip</Link> (to fix a mistake, delete it and import the spreadsheet again)</p>
      : <LeaveGolfTrip tripId={tripId} />}
  </main>;
}
