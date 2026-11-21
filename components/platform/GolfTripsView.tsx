import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Flag, Plane, Plus, type LucideIcon } from "lucide-react";
import { golfTripUrl, splitGolfTrips, tripDateRange, type GolfTripSummary } from "@/lib/platform/golfTripCreate";
import { GolfTripsActions } from "./GolfTripsActions";
import { PastTripImport } from "./PastTripImport";
import styles from "@/app/golf-trips/page.module.css";
import landing from "./SectionLanding.module.css";

/** What the Golf Trips page knows about your trips (getUserGolfTrips on the website; GET /api/golf-trips in the app). */
export type GolfTripsResult = { status: "ok"; trips: GolfTripSummary[] } | { status: "signed-out" } | { status: "unavailable" };

/**
 * Golf Trips: Create + Join buttons, The Maroon Live, then My Trips (upcoming + past) — the standard way back into a saved trip.
 * Shared by the website's page (loaded on the server) and the iPhone / Android app's (loaded from the API), so both
 * look and work the same. Each trip opens its one trip page (golfTripUrl).
 */
export function GolfTripsView({ result }: { result: GolfTripsResult }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const { upcoming, past } = result.status === "ok" ? splitGolfTrips(result.trips, today) : { upcoming: [], past: [] };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={landing.title}>Golf Trips</h1>
        <GolfTripsActions />

        <Link href="/golf-trips/live" className={styles.live} aria-labelledby="maroon-live-entry-title" aria-describedby="maroon-live-entry-description">
          <span className={styles.liveText}>
            <span id="maroon-live-entry-title" className={styles.liveTitle}>The Maroon Live</span>
            <span id="maroon-live-entry-description" className={styles.liveDescription}>Check out other trips happening now</span>
          </span>
          <ChevronRight size={21} strokeWidth={2} aria-hidden="true" />
        </Link>

        {result.status === "ok" ? <>
          <TripSection id="upcoming-trips" heading="Upcoming" trips={upcoming} icon={Plane}
            empty={<Link href="/tournaments/create/golf-trip" className={styles.row}>
              <span className={styles.iconBox} aria-hidden="true"><Plane size={18} strokeWidth={2} /></span>
              <span className={styles.rowText}><span className={styles.rowName}>No upcoming trip yet</span></span>
              <span className={styles.rowValue}>Start <Plus size={16} strokeWidth={2.5} aria-hidden="true" /></span>
            </Link>} />
          <TripSection id="past-trips" heading="Past Trips" trips={past} icon={Flag} action={<PastTripImport />}
            empty={<div className={styles.row}>
              <span className={styles.iconBox} aria-hidden="true"><Flag size={18} strokeWidth={2} /></span>
              <span className={styles.rowText}><span className={styles.rowName}>No past trips yet</span></span>
            </div>} />
        </> : <section aria-labelledby="my-trips-heading">
          <h2 id="my-trips-heading" className={styles.heading}>My Trips</h2>
          {result.status === "signed-out"
            ? <Link href="/login" className={`${styles.rowName} ${styles.signedOut}`}>Log in to see your trips</Link>
            : <div className={styles.card}><p className={styles.row}>We couldn&apos;t load your trips. Refresh to try again.</p></div>}
        </section>}
      </div>
    </main>
  );
}

/** One "accounts"-style group: a small caps heading, then a white card of rows (or one empty row). */
/** `action`: a button beside the heading (Past Trips → Import past trip). */
function TripSection({ id, heading, trips, icon: Icon, empty, action }: { id: string; heading: string; trips: GolfTripSummary[]; icon: LucideIcon; empty: ReactNode; action?: ReactNode }) {
  return <section aria-labelledby={id}>
    <div className={styles.headingRow}><h2 id={id} className={styles.heading}>{heading}</h2>{action}</div>
    <div className={styles.card}>
      {trips.length > 0
        ? <ul className={styles.tripList}>
          {trips.map((trip) => <li key={trip.id}>
            <Link href={golfTripUrl(trip.id)} className={styles.row}>
              <span className={styles.iconBox} aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
              <span className={styles.rowText}>
                <span className={styles.rowName}>{trip.name}</span>
                <span className={styles.rowMeta}>{[trip.destination, playerCount(trip), trip.role === "organizer" ? "Organizer" : "Member"].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={styles.rowValue}>{tripDateRange(trip.startDate, trip.endDate).replace(/, \d{4}$/, "")}</span>
              <ChevronRight size={20} strokeWidth={2} aria-hidden="true" className={styles.rowArrow} />
            </Link>
          </li>)}
        </ul>
        : empty}
    </div>
  </section>;
}

function playerCount(trip: GolfTripSummary): string {
  const count = trip.expectedTravelerCount ?? trip.memberCount;
  return `${count} ${count === 1 ? "player" : "players"}`;
}
