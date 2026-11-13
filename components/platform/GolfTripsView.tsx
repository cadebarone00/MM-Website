import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Flag, Plane, Plus, UserRound, type LucideIcon } from "lucide-react";
import { golfTripUrl, splitGolfTrips, tripDateRange, type GolfTripSummary } from "@/lib/platform/golfTripCreate";
import { JoinCodeCard } from "./JoinCodeCard";
import { SignInRequiredLink } from "./SignInRequiredLink";
import { PastTripImport } from "./PastTripImport";
import styles from "@/app/golf-trips/page.module.css";

/** What the Golf Trips page knows about your trips (getUserGolfTrips on the website; GET /api/golf-trips in the app). */
export type GolfTripsResult = { status: "ok"; trips: GolfTripSummary[] } | { status: "signed-out" } | { status: "unavailable" };

/**
 * Golf Trips: Join a Trip, start a new trip, then My Trips (upcoming + past) — the standard way back into a saved trip.
 * Shared by the website's page (loaded on the server) and the iPhone / Android app's (loaded from the API), so both
 * look and work the same. Each trip opens its one trip page (golfTripUrl).
 */
export function GolfTripsView({ result }: { result: GolfTripsResult }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const { upcoming, past } = result.status === "ok" ? splitGolfTrips(result.trips, today) : { upcoming: [], past: [] };

  return (
    <main className={styles.page}>
      {/* Maroon band at the top; the Join card overlaps its bottom edge (money-app dashboard look). */}
      <div className={styles.band}>
        <h1 className={styles.title}>Your Next Golf Trip<br />Just Got Better</h1>
      </div>

      <div className={styles.content}>
        <JoinCodeCard kind="trip" />
        <SignInRequiredLink href="/tournaments/create/golf-trip" className={styles.create} message="Sign in to create a golf trip">
          <span className={styles.createLabel}>Plan something new</span>
          <span className={styles.createTitle}>Create a Golf Trip</span>
          <span className={styles.createPhoto}>
            <Image src="/schedule/courses/petedye/37c88500018493969bee.webp" alt="" fill priority sizes="(max-width: 600px) 90vw, 528px" />
          </span>
          <span className={styles.createRow}>
            <span className={styles.iconBox} aria-hidden="true"><Plus size={18} strokeWidth={2.25} /></span>
            Start planning
            <ChevronRight size={20} strokeWidth={2} aria-hidden="true" className={styles.rowArrow} />
          </span>
        </SignInRequiredLink>

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
          <div className={styles.card}>
            {result.status === "signed-out"
              ? <Link href="/login" className={styles.row}>
                <span className={styles.iconBox} aria-hidden="true"><UserRound size={18} strokeWidth={2} /></span>
                <span className={styles.rowText}><span className={styles.rowName}>Log in to see your trips</span></span>
                <span className={styles.rowValue}>Log in <ChevronRight size={18} strokeWidth={2} aria-hidden="true" /></span>
              </Link>
              : <p className={styles.row}>We couldn&apos;t load your trips. Refresh to try again.</p>}
          </div>
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
