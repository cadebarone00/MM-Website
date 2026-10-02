import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { golfTripUrl, splitGolfTrips, tripDateRange, type GolfTripSummary } from "@/lib/platform/golfTripCreate";
import { getUserGolfTrips } from "@/lib/platform/golfTripsServer";
import { GolfTripJoin } from "@/components/platform/GolfTripJoin";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Golf Trips | The Maroon" };

/**
 * Golf Trips: start a new trip, Join a Trip, then My Trips (upcoming + past) — the standard way back into a saved trip.
 * Loaded fresh from Supabase on every visit (getUserGolfTrips), so a deleted trip simply isn't listed.
 * Each trip opens the one canonical trip page, /golf-trips/<id>.
 */
export default async function GolfTripsPage() {
  const result = await getUserGolfTrips();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const { upcoming, past } = result.status === "ok" ? splitGolfTrips(result.trips, today) : { upcoming: [], past: [] };
  const note = result.status === "signed-out" ? <><Link href="/login" className={styles.noteLink}>Log in</Link> to see your trips.</>
    : result.status === "error" ? "We couldn't load your trips. Refresh to try again." : null;

  return (
    <main className={styles.page}>
      <Link href="/tournaments/create/golf-trip" className={styles.create}>
        <span className={styles.plus} aria-hidden="true"><Plus size={20} strokeWidth={2.25} /></span>
        Create a Golf Trip
      </Link>
      <GolfTripJoin />

      <section aria-labelledby="my-trips-heading" className={styles.trips}>
        <h2 id="my-trips-heading" className={styles.heading}>My Trips</h2>
        <div className={styles.card}>
          <TripGroup label="Upcoming Trip" trips={upcoming} empty={note ?? "No upcoming trip yet."} />
          <TripGroup label="Past Trips" trips={past} empty={note ? null : "No past trips yet."} />
        </div>
      </section>
    </main>
  );
}

function TripGroup({ label, trips, empty }: { label: string; trips: GolfTripSummary[]; empty: ReactNode }) {
  return <div className={styles.group}>
    <h3 className={styles.label}>{label}</h3>
    {trips.length > 0
      ? <ul className={styles.tripList}>
          {trips.map((trip) => <li key={trip.id}>
            <Link href={golfTripUrl(trip.id)} className={styles.trip}>
              <span className={styles.tripText}>
                <span className={styles.tripName}>{trip.name}</span>
                <span className={styles.tripMeta}>{[trip.destination, tripDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(" · ")}</span>
                <span className={styles.tripMeta}>{playerCount(trip)} · {trip.role === "organizer" ? "Organizer" : "Member"}</span>
              </span>
              <ChevronRight size={20} strokeWidth={2} aria-hidden="true" className={styles.tripArrow} />
            </Link>
          </li>)}
        </ul>
      : empty && <p className={styles.note}>{empty}</p>}
  </div>;
}

function playerCount(trip: GolfTripSummary): string {
  const count = trip.expectedTravelerCount ?? trip.memberCount;
  return `${count} ${count === 1 ? "player" : "players"}`;
}
