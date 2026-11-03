"use client";

import { useState } from "react";
import { Beer, Check, Coffee, Flag, Ticket, Utensils, X, type LucideIcon } from "lucide-react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { RATING_MAX, type PlaceCategory } from "@/lib/platform/venuePlaces";
import styles from "./RatePlacesPrompt.module.css";

const ICONS: Record<PlaceCategory, LucideIcon> = { food: Utensils, bars: Beer, golf: Flag, coffee: Coffee, todo: Ticket };
export type RatingStage = "off" | "prompt" | "one" | "done";
type Visit = { placeId: string; name: string; category: PlaceCategory; when: string };

/** DEV ONLY sample: yesterday's itinerary plans at places (phase 4 reads these from the trip's itinerary). */
const YESTERDAY: Visit[] = [
  { placeId: "sample-10", name: "Cartel Coffee Lab", category: "coffee", when: "Breakfast · 8:00 AM" },
  { placeId: "sample-7", name: "TPC Scottsdale", category: "golf", when: "Round 1 · 10:30 AM" },
  { placeId: "sample-4", name: "Goldwater Brewing", category: "bars", when: "After the round · 4:00 PM" },
  { placeId: "sample-0", name: "The Mission", category: "food", when: "Team dinner · 7:30 PM" },
];

/**
 * Phase 4 (project_specs.md "Venue tab → Places recommendations"): the first app open the day after itinerary plans, a
 * slide-up in the date / time picker's style asks "How was yesterday?": a 1-10 per place (tap a number; tap it again to
 * clear); leaving a place blank skips it. Submit sends what was rated; "Not now" closes and asks again tomorrow.
 * DEV PREVIEW ONLY for now; the simulator's Home conditionals open it (prompt / one rated / thank-you).
 */
export function RatePlacesPrompt() {
  const stage: RatingStage = useSimulator()?.state.ratingStage ?? "off";
  if (stage === "off") return null;
  return <PromptSheet key={stage} stage={stage} />;
}

function PromptSheet({ stage }: { stage: Exclude<RatingStage, "off"> }) {
  const [ratings, setRatings] = useState<Record<string, number>>(stage === "one" ? { "sample-7": 9 } : {});
  const [done, setDone] = useState(stage === "done");
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const rated = Object.keys(ratings).length;
  const rate = (placeId: string, value: number) => setRatings((current) => {
    const next = { ...current };
    if (next[placeId] === value) delete next[placeId]; else next[placeId] = value;
    return next;
  });

  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Rate yesterday's places" onClick={(event) => { if (event.target === event.currentTarget) setClosed(true); }}>
    <div className={styles.sheet}>
      <button type="button" className={styles.close} aria-label="Close" onClick={() => setClosed(true)}><X size={20} aria-hidden /></button>
      {done ? <div className={styles.thanks}>
        <span className={styles.thanksIcon}><Check size={28} aria-hidden /></span>
        <h2 className={styles.title}>Thanks!</h2>
        <p className={styles.subtitle}>Your ratings help the next Maroon trip find the best spots.</p>
        <button type="button" className={styles.submit} onClick={() => setClosed(true)}>Done</button>
      </div> : <>
        <h2 className={styles.title}>How was yesterday?</h2>
        <p className={styles.subtitle}>Rate the places you went, 1 to 10. Skip any you would rather not.</p>
        <ul className={styles.list}>
          {YESTERDAY.map((visit) => {
            const Icon = ICONS[visit.category];
            const score = ratings[visit.placeId];
            return <li key={visit.placeId} className={styles.place}>
              <div className={styles.placeHead}>
                <span className={styles.icon}><Icon size={18} aria-hidden /></span>
                <span className={styles.placeText}><strong>{visit.name}</strong><small>{visit.when}</small></span>
                <span className={styles.score} aria-hidden>{score ?? "–"}</span>
              </div>
              <div className={styles.scale} role="radiogroup" aria-label={`Rate ${visit.name}`}>
                {Array.from({ length: RATING_MAX }, (_, index) => index + 1).map((value) =>
                  <button key={value} type="button" role="radio" aria-checked={score === value} aria-label={`${value} out of ${RATING_MAX}`}
                    className={styles.dot} data-on={score !== undefined && value <= score} onClick={() => rate(visit.placeId, value)}>{value}</button>)}
              </div>
            </li>;
          })}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.submit} disabled={!rated} onClick={() => setDone(true)}>{rated ? `Submit ${rated} ${rated === 1 ? "rating" : "ratings"}` : "Rate a place to submit"}</button>
          <button type="button" className={styles.later} onClick={() => setClosed(true)}>Not now</button>
        </div>
      </>}
    </div>
  </div>;
}
