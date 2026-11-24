"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight, BedDouble, Check } from "lucide-react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { startGolfTripDraft } from "@/lib/platform/golfTripDraft";
import type { FeaturedTrip } from "@/lib/content/ribbon";
import styles from "./TripPromos.module.css";

/**
 * Play page → Explore filter: the Featured trip (in place of the old "There's more to the game" photo). One landscape card
 * with just the city; tapping it opens the itinerary with price levels to switch between. LOOK ONLY for now (owner
 * request 2026-10-10): a sample itinerary with estimated prices. "Plan this trip" starts a normal golf trip.
 */

/** `courses` = one per round, in order: what "Plan this trip" fills into the trip's Courses step. */
/** Suggested dates for a planned trip: the first Thursday at least 4 weeks out, through Sunday (3 nights). Changeable in Trip Basics. */
function suggestedDates(today = new Date()): { startDate: string; endDate: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 28);
  start.setDate(start.getDate() + ((4 - start.getDay() + 7) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 3);
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { startDate: day(start), endDate: day(end) };
}

export { BUILT_IN_TRIP } from "@/lib/content/builtInTrip";
import { BUILT_IN_TRIP } from "@/lib/content/builtInTrip";

/** `trip` = this week's live trip plan (defaults to the built-in one); `adminSlot` = admin controls over the card. */
export function TripPromos({ trip = BUILT_IN_TRIP, adminSlot }: { trip?: FeaturedTrip; adminSlot?: ReactNode } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tierId, setTierId] = useState("standard");
  const tier = trip.tiers.find((t) => t.id === tierId) ?? trip.tiers[0];
  if (!tier) return null;
  // Plan this trip: a new trip draft from this itinerary (one golf day per round), then the trip questionnaire, filled in.
  function planTrip() {
    startGolfTripDraft({
      tripName: `${trip.city} Golf Trip`, destination: `${trip.city}, ${trip.region}`, playerCount: String(trip.players),
      ...suggestedDates(), golfDays: String(tier.courses.length), knowsLodging: "yes",
      ...Object.fromEntries(tier.courses.flatMap((course, i) => [[`day${i + 1}Rounds`, "1"], [`round${i + 1}Course`, course]])),
    });
    router.push("/golf-trips/new");
  }

  return <section className={styles.wrap} aria-labelledby="featured-title">
    <h2 id="featured-title" className={styles.heading}>Featured trip</h2>
    <div className={styles.cardWrap}>{adminSlot}<button type="button" className={styles.card} aria-haspopup="dialog" onClick={() => setOpen(true)} aria-label={`Featured trip: ${trip.city}. Open the itinerary`}>
      <Image src={trip.image} alt="" fill sizes="(max-width: 600px) 92vw, 1000px" />
      <span className={styles.city}>{trip.city}</span>
      <span className={styles.open}>View trip <ArrowRight size={14} aria-hidden="true" /></span>
    </button></div>

    {open && <GolfTripActionSheet label={`${trip.city} trip`} onClose={() => setOpen(false)} className={styles.sheet} style={{ top: "calc(16px + env(safe-area-inset-top))", bottom: "calc(6.5rem + env(safe-area-inset-bottom))" }}>
      <button type="button" className={styles.backButton} onClick={() => setOpen(false)}><ArrowLeft size={16} aria-hidden="true" /> Back to Explore</button>
      <div className={styles.sheetPhoto}><Image src={trip.image} alt="" fill sizes="420px" /></div>
      <h3 className={styles.sheetTitle}>{trip.city}, {trip.region}</h3>
      <p className={styles.sheetMeta}>{trip.length}</p>
      <div className={styles.tiers} role="radiogroup" aria-label="Price level">
        {trip.tiers.map((t) => <button key={t.id} type="button" role="radio" aria-checked={t.id === tier.id} onClick={() => setTierId(t.id)}>
          <span>{t.label}</span><b>{t.price}</b>
        </button>)}
      </div>
      <p className={styles.price}><b>{tier.price}</b> per person, estimated</p>
      <ol className={styles.days} aria-label="Itinerary">{tier.days.map((d) => <li key={d.day}><b>{d.day}</b><span>{d.plan}</span></li>)}</ol>
      <p className={styles.stay}><BedDouble size={15} aria-hidden="true" /> {tier.stay}</p>
      <ul className={styles.includes} aria-label="Included">{tier.includes.map((item) => <li key={item}><Check size={14} aria-hidden="true" /> {item}</li>)}</ul>
      <button type="button" className={styles.plan} onClick={planTrip}>Plan this trip <ArrowRight size={16} aria-hidden="true" /></button>
      <p className={styles.fine}>Sample itinerary with estimated prices. Plan this trip fills in the trip setup for you, with suggested dates you can change.</p>
    </GolfTripActionSheet>}
  </section>;
}
