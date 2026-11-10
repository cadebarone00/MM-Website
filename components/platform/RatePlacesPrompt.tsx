"use client";

import { useEffect, useState } from "react";
import { Beer, Check, Coffee, Flag, MapPin, Ticket, Utensils, X, type LucideIcon } from "lucide-react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { RATING_MAX, type PlaceCategory } from "@/lib/platform/venuePlaces";
import styles from "./RatePlacesPrompt.module.css";

const ICONS: Record<PlaceCategory, LucideIcon> = { food: Utensils, bars: Beer, golf: Flag, coffee: Coffee, todo: Ticket };
export type RatingStage = "off" | "prompt" | "one" | "done";
/** One visit to ask about: a plan at a place (`visitedOn` = the plan's day). */
export type Visit = { placeId: string; name: string; category?: PlaceCategory; when: string; visitedOn: string };

/** DEV ONLY sample: yesterday's itinerary plans at places (real trips pass their own `visits`). */
const SAMPLE_VISITS: Visit[] = [
  { placeId: "sample-10", name: "Cartel Coffee Lab", category: "coffee", when: "Breakfast · 8:00 AM", visitedOn: "2027-04-22" },
  { placeId: "sample-7", name: "TPC Scottsdale", category: "golf", when: "Round 1 · 10:30 AM", visitedOn: "2027-04-22" },
  { placeId: "sample-4", name: "Goldwater Brewing", category: "bars", when: "After the round · 4:00 PM", visitedOn: "2027-04-22" },
  { placeId: "sample-0", name: "The Mission", category: "food", when: "Team dinner · 7:30 PM", visitedOn: "2027-04-22" },
];
const NOT_NOW_KEY = (tripId: string) => `maroon_rate_not_now_${tripId}`;
const today = () => new Date().toLocaleDateString("en-CA");

/**
 * After-visit ratings (Venue places phase 4, project_specs.md): a slide-up in the date / time picker's style asks "How
 * was yesterday?" for recent plans at places — tap 1-10 per place (tap again to clear) or Skip it (never asked again).
 * Submit saves the ratings and skips; "Not now" closes it until tomorrow (this device).
 *   * `tripId` + `visits` (a real trip): asks about the visits not already rated or skipped (GET / POST
 *     /api/golf-trips/<trip>/ratings).
 *   * neither (dev simulator): sample visits; the simulator's Home conditionals open it (prompt / one rated / thank-you).
 */
export function RatePlacesPrompt({ tripId, visits }: { tripId?: string; visits?: Visit[] } = {}) {
  const stage: RatingStage = useSimulator()?.state.ratingStage ?? "off";
  if (tripId) return visits?.length ? <LivePrompt tripId={tripId} visits={visits} /> : null;
  if (stage === "off") return null;
  return <PromptSheet key={stage} visits={SAMPLE_VISITS} initialRatings={stage === "one" ? { "sample-7": 9 } : {}} initialDone={stage === "done"}
    onSubmit={async () => true} onClose={() => undefined} />;
}

function LivePrompt({ tripId, visits }: { tripId: string; visits: Visit[] }) {
  const [open, setOpen] = useState<Visit[] | null>(null);
  const key = visits.map((v) => v.placeId).join(",");
  useEffect(() => {
    let current = true;
    try { if (localStorage.getItem(NOT_NOW_KEY(tripId)) === today()) return; } catch { /* storage blocked: ask anyway */ }
    (async () => {
      const response = await fetch(`/api/golf-trips/${tripId}/ratings`, { cache: "no-store" }).catch(() => null);
      const body = response?.ok ? await response.json().catch(() => null) as { done?: string[] } | null : null;
      if (!current || !body) return; // ratings not switched on yet, or offline: just don't ask
      const left = visits.filter((v) => !(body.done ?? []).includes(v.placeId));
      if (left.length) setOpen(left);
    })();
    return () => { current = false; };
  }, [tripId, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for `visits`
  if (!open) return null;
  return <PromptSheet visits={open} onClose={(notNow) => {
    if (notNow) try { localStorage.setItem(NOT_NOW_KEY(tripId), today()); } catch { /* storage blocked */ }
    setOpen(null);
  }} onSubmit={async (ratings, skips) => {
    const response = await fetch(`/api/golf-trips/${tripId}/ratings`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratings: open.filter((v) => ratings[v.placeId]).map((v) => ({ placeId: v.placeId, rating: ratings[v.placeId], visitedOn: v.visitedOn })), skips }) }).catch(() => null);
    return !!response?.ok;
  }} />;
}

function PromptSheet({ visits, initialRatings = {}, initialDone = false, onSubmit, onClose }: {
  visits: Visit[]; initialRatings?: Record<string, number>; initialDone?: boolean;
  onSubmit: (ratings: Record<string, number>, skips: string[]) => Promise<boolean>; onClose: (notNow: boolean) => void;
}) {
  const [ratings, setRatings] = useState<Record<string, number>>(initialRatings);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [done, setDone] = useState(initialDone);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (closed) return null;
  const close = (notNow: boolean) => { setClosed(true); onClose(notNow); };
  const rated = Object.keys(ratings).length, answered = rated + skipped.length;
  const rate = (placeId: string, value: number) => setRatings((current) => {
    const next = { ...current };
    if (next[placeId] === value) delete next[placeId]; else next[placeId] = value;
    return next;
  });
  const skip = (placeId: string) => {
    setSkipped((list) => list.includes(placeId) ? list.filter((id) => id !== placeId) : [...list, placeId]);
    setRatings((current) => { const next = { ...current }; delete next[placeId]; return next; });
  };
  const submit = async () => {
    setBusy(true); setError(null);
    if (await onSubmit(ratings, skipped)) setDone(true); else setError("Couldn't save your ratings. Try again.");
    setBusy(false);
  };
  const label = rated ? `Submit ${rated} ${rated === 1 ? "rating" : "ratings"}` : skipped.length ? "Done" : "Rate or skip a place";

  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Rate yesterday's places" onClick={(event) => { if (event.target === event.currentTarget) close(true); }}>
    <div className={styles.sheet}>
      <button type="button" className={styles.close} aria-label="Close" onClick={() => close(!done)}><X size={20} aria-hidden /></button>
      {done ? <div className={styles.thanks}>
        <span className={styles.thanksIcon}><Check size={28} aria-hidden /></span>
        <h2 className={styles.title}>Thanks!</h2>
        <p className={styles.subtitle}>Your ratings help the next Maroon trip find the best spots.</p>
        <button type="button" className={styles.submit} onClick={() => close(false)}>Done</button>
      </div> : <>
        <h2 className={styles.title}>How was yesterday?</h2>
        <p className={styles.subtitle}>Rate the places you went, 1 to 10, or skip any you&apos;d rather not.</p>
        <ul className={styles.list}>
          {visits.map((visit) => {
            const Icon = visit.category ? ICONS[visit.category] : MapPin;
            const score = ratings[visit.placeId], isSkipped = skipped.includes(visit.placeId);
            return <li key={visit.placeId} className={`${styles.place} ${isSkipped ? styles.placeSkipped : ""}`}>
              <div className={styles.placeHead}>
                <span className={styles.icon}><Icon size={18} aria-hidden /></span>
                <span className={styles.placeText}><strong>{visit.name}</strong><small>{visit.when}</small></span>
                <span className={styles.score} aria-hidden>{isSkipped ? "" : score ?? "–"}</span>
                <button type="button" className={styles.skip} aria-pressed={isSkipped} onClick={() => skip(visit.placeId)}>{isSkipped ? "Undo" : "Skip"}</button>
              </div>
              {isSkipped ? <p className={styles.skippedNote}>Skipped. We won&apos;t ask about this one again.</p>
                : <div className={styles.scale} role="radiogroup" aria-label={`Rate ${visit.name}`}>
                  {Array.from({ length: RATING_MAX }, (_, index) => index + 1).map((value) =>
                    <button key={value} type="button" role="radio" aria-checked={score === value} aria-label={`${value} out of ${RATING_MAX}`}
                      className={styles.dot} data-on={score !== undefined && value <= score} onClick={() => rate(visit.placeId, value)}>{value}</button>)}
                </div>}
            </li>;
          })}
        </ul>
        <p className={styles.error} role="alert">{error}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.submit} disabled={!answered || busy} onClick={() => void submit()}>{busy ? "Saving…" : label}</button>
          <button type="button" className={styles.later} onClick={() => close(true)}>Not now</button>
        </div>
      </>}
    </div>
  </div>;
}
