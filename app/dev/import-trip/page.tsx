import Link from "next/link";
import { ChevronRight, Flag } from "lucide-react";
import { PastTripImport } from "@/components/platform/PastTripImport";
import { samplePastTrips } from "@/lib/dev/samplePastTrips";
import { tripDateRange } from "@/lib/platform/golfTripCreate";
import styles from "@/app/golf-trips/page.module.css";

export const dynamic = "force-dynamic";

/**
 * App simulator → Import past trip (sample): the Golf Trips page's Past Trips section with the real Import past trip
 * flow. Uploads are checked for real; Add trip keeps the trip in the dev server's memory only (nothing saved).
 */
export default function SampleImportTrip() {
  const trips = samplePastTrips();
  return <main className={styles.page}>
    {/* No maroon band on this sample, so the content doesn't slide up under one. */}
    <div className={styles.content} style={{ marginTop: 0, paddingTop: "var(--app-top-clearance)" }}>
      <p className={styles.heading}>App simulator sample · nothing is saved</p>
      <section aria-labelledby="past-trips">
        <div className={styles.headingRow}><h2 id="past-trips" className={styles.heading}>Past Trips</h2><PastTripImport endpoint="/api/dev/past-trip-import" walkthroughHref="/dev/import-trip/new" /></div>
        <div className={styles.card}>
          {trips.length ? <ul className={styles.tripList}>{trips.map(({ id, input }) => <li key={id}>
            <Link href={`/dev/import-trip/${id}`} className={styles.row}>
              <span className={styles.iconBox} aria-hidden="true"><Flag size={18} strokeWidth={2} /></span>
              <span className={styles.rowText}><span className={styles.rowName}>{input.name}</span>
                <span className={styles.rowMeta}>{input.destination} · {input.players.length} players · Organizer</span></span>
              <span className={styles.rowValue}>{tripDateRange(input.startDate, input.endDate).replace(/, \d{4}$/, "")}</span>
              <ChevronRight size={20} strokeWidth={2} aria-hidden="true" className={styles.rowArrow} />
            </Link></li>)}</ul>
            : <div className={styles.row}><span className={styles.iconBox} aria-hidden="true"><Flag size={18} strokeWidth={2} /></span>
              <span className={styles.rowText}><span className={styles.rowName}>No past trips yet</span><span className={styles.rowMeta}>Tap Import past trip to add one</span></span></div>}
        </div>
      </section>
    </div>
  </main>;
}
