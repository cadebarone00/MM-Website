"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight, BedDouble, Check } from "lucide-react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { startGolfTripDraft } from "@/lib/platform/golfTripDraft";
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

type Tier = { id: string; label: string; price: string; stay: string; courses: string[]; days: { day: string; plan: string }[]; includes: string[] };

const FEATURED: { city: string; region: string; length: string; players: number; image: string; tiers: Tier[] } = {
  city: "Palm Springs",
  region: "California",
  length: "3 nights · 4 rounds",
  players: 4,
  image: "/schedule/mission-hills.webp",
  tiers: [
    { id: "value", label: "Value", price: "$850", stay: "Shared rental house in Cathedral City",
      courses: ["Escena Golf Club", "Indian Canyons (North)", "Desert Willow (Mountain View)", "Tahquitz Creek (Legend)"],
      days: [
        { day: "Thu", plan: "Arrive PSP · Escena Golf Club (afternoon)" },
        { day: "Fri", plan: "Indian Canyons (North) · team scramble" },
        { day: "Sat", plan: "Desert Willow (Mountain View) · Wolf" },
        { day: "Sun", plan: "Tahquitz Creek (Legend) · singles · fly home" },
      ],
      includes: ["4 rounds with cart", "3 nights lodging (shared)", "Group games set up in the app"] },
    { id: "standard", label: "Standard", price: "$1,250", stay: "Villas at Mission Hills",
      courses: ["Desert Willow (Firecliff)", "Mission Hills · Pete Dye Challenge", "Mission Hills · Arnold Palmer", "Indian Wells (Celebrity)"],
      days: [
        { day: "Thu", plan: "Arrive PSP · Desert Willow (Firecliff)" },
        { day: "Fri", plan: "Mission Hills · Pete Dye Challenge · scramble" },
        { day: "Sat", plan: "Mission Hills · Arnold Palmer · Wolf" },
        { day: "Sun", plan: "Indian Wells (Celebrity) · singles · fly home" },
      ],
      includes: ["4 rounds with cart", "3 nights in on-course villas", "Welcome dinner", "Group games set up in the app"] },
    { id: "premium", label: "Premium", price: "$2,100", stay: "La Quinta Resort & Club",
      courses: ["La Quinta Mountain Course", "PGA West Stadium", "PGA West Nicklaus Tournament", "Mission Hills · Pete Dye Challenge"],
      days: [
        { day: "Thu", plan: "Arrive PSP · La Quinta Mountain Course" },
        { day: "Fri", plan: "PGA West Stadium · scramble" },
        { day: "Sat", plan: "PGA West Nicklaus Tournament · Wolf" },
        { day: "Sun", plan: "Mission Hills · Pete Dye Challenge · singles · fly home" },
      ],
      includes: ["4 premium rounds with cart & range", "3 nights resort lodging", "Airport transfers", "Group dinner", "Group games set up in the app"] },
  ],
};

export function TripPromos() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tierId, setTierId] = useState("standard");
  const tier = FEATURED.tiers.find((t) => t.id === tierId) ?? FEATURED.tiers[0];
  // Plan this trip: a new trip draft from this itinerary (one golf day per round), then the trip questionnaire, filled in.
  function planTrip() {
    startGolfTripDraft({
      tripName: `${FEATURED.city} Golf Trip`, destination: `${FEATURED.city}, ${FEATURED.region}`, playerCount: String(FEATURED.players),
      ...suggestedDates(), golfDays: String(tier.courses.length), knowsLodging: "yes",
      ...Object.fromEntries(tier.courses.flatMap((course, i) => [[`day${i + 1}Rounds`, "1"], [`round${i + 1}Course`, course]])),
    });
    router.push("/golf-trips/new");
  }

  return <section className={styles.wrap} aria-labelledby="featured-title">
    <h2 id="featured-title" className={styles.heading}>Featured trip</h2>
    <button type="button" className={styles.card} aria-haspopup="dialog" onClick={() => setOpen(true)} aria-label={`Featured trip: ${FEATURED.city}. Open the itinerary`}>
      <Image src={FEATURED.image} alt="" fill sizes="(max-width: 600px) 92vw, 1000px" />
      <span className={styles.city}>{FEATURED.city}</span>
      <span className={styles.open}>View trip <ArrowRight size={14} aria-hidden="true" /></span>
    </button>

    {open && <GolfTripActionSheet label={`${FEATURED.city} trip`} onClose={() => setOpen(false)} className={styles.sheet} style={{ top: "calc(16px + env(safe-area-inset-top))", bottom: "calc(6.5rem + env(safe-area-inset-bottom))" }}>
      <button type="button" className={styles.backButton} onClick={() => setOpen(false)}><ArrowLeft size={16} aria-hidden="true" /> Back to Explore</button>
      <div className={styles.sheetPhoto}><Image src={FEATURED.image} alt="" fill sizes="420px" /></div>
      <h3 className={styles.sheetTitle}>{FEATURED.city}, {FEATURED.region}</h3>
      <p className={styles.sheetMeta}>{FEATURED.length}</p>
      <div className={styles.tiers} role="radiogroup" aria-label="Price level">
        {FEATURED.tiers.map((t) => <button key={t.id} type="button" role="radio" aria-checked={t.id === tier.id} onClick={() => setTierId(t.id)}>
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
