import Link from "next/link";
import { WebsiteBrand } from "@/components/marketing/WebsiteBrand";
import { LIVE_TRIP_MOCKS, type LiveTripCount } from "@/lib/website/liveTripMocks";
import styles from "./MaroonLiveDirectory.module.css";
import { ChevronLeft } from "lucide-react";

export function MaroonLiveDirectory({ count = 3, surface = "website" }: { count?: LiveTripCount; surface?: "app" | "website" }) {
  const trips = LIVE_TRIP_MOCKS.slice(0, count);
  return <main className={`${styles.page} ${surface === "app" ? styles.appPage : ""}`}>
    {surface === "app" ? <header className={styles.appHeader}>
      <Link href="/golf-trips" className={styles.appBack} aria-label="Back to Golf Trips"><ChevronLeft size={24} aria-hidden="true" /></Link>
      <h1 id="maroon-live-title">The Maroon Live</h1>
    </header> : <header className={styles.header}><WebsiteBrand href="/website" /><Link href="/website" className={styles.back}>Back to website</Link></header>}
    <section className={styles.directory} aria-labelledby="maroon-live-title">
      {surface === "website" && <h1 id="maroon-live-title" className={styles.title}>The Maroon Live</h1>}
      <div className={styles.listHeading}><h2>Trips going on</h2><span>{trips.length} {trips.length === 1 ? "trip" : "trips"}</span></div>
      {trips.length ? <ul className={styles.list} aria-label="Trips going on">
        {trips.map(trip => <li className={styles.trip} key={trip.id}>
          <h3>{trip.name}</h3><p>{trip.location}</p>
        </li>)}
      </ul> : <div className={styles.empty}><h3>No trips going on right now</h3><p>Check back for the next trip.</p></div>}
    </section>
  </main>;
}
