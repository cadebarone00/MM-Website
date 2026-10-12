"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import styles from "./GolfTripDatePicker.module.css";

/** Solid triangle arrow (a filled-in < or >) for the month buttons. */
const Arrow = ({ left }: { left?: boolean }) => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d={left ? "M10 1.5 3 7l7 5.5z" : "M4 1.5 11 7l-7 5.5z"} fill="currentColor" /></svg>;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const plusDays = (iso: string, by: number) => { const date = toDate(iso); date.setUTCDate(date.getUTCDate() + by); return toIso(date); };
const format = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(toDate(iso));

/**
 * Cream month calendar in a popup for a trip's dates (YYYY-MM-DD). Tap the arrival day, the title switches to
 * Departure, tap the departure day (up to `maxDays` long); circles mark endpoints with a translucent range between.
 * Once complete, picking any date starts a new arrival/departure range. Single-day mode submits just one date.
 */
export function GolfTripDatePicker({ arrival, departure, maxDays, onSubmit, onClose, singleDay = false, label = "Date", min, max }: {
  arrival: string; departure: string; maxDays: number; onSubmit: (arrival: string, departure: string) => void; onClose: () => void;
  singleDay?: boolean; label?: string; min?: string; max?: string;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  const [start, setStart] = useState(arrival);
  const [end, setEnd] = useState<string | null>(departure || null);
  const [phase, setPhase] = useState<"Arrival" | "Departure">("Arrival");
  const [month, setMonth] = useState(() => (arrival || min || new Date().toLocaleDateString("en-CA")).slice(0, 7));
  const first = toDate(`${month}-01`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday-first week
  const cells = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)];
  const shiftMonth = (by: number) => setMonth(toIso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + by, 1))).slice(0, 7));
  const lastDeparture = start ? plusDays(start, maxDays - 1) : "";
  const pick = (iso: string) => {
    if (singleDay) { setStart(iso); setEnd(iso); }
    else if (end || !start) { setStart(iso); setEnd(null); setPhase("Departure"); }
    else { setEnd(iso); setPhase("Arrival"); }
  };
  const short = (iso: string) => format(iso, { day: "numeric", month: "short" });

  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={singleDay ? label : "Trip dates"} onClick={onClose}>
    <div ref={sheet} className={styles.sheet} onClick={event => event.stopPropagation()}>
      <div className={styles.top}>
        <div>
          <h2 className={styles.title} aria-live="polite">{singleDay ? label : phase}</h2>
          <p className={styles.current}>{singleDay ? start ? `${short(start)} ${start.slice(0, 4)}` : "Pick a date" : end ? `${short(start)} – ${short(end)} ${end.slice(0, 4)}` : !start ? "Pick arrival" : `${short(start)} – pick departure`}</p>
        </div>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}><X size={20} aria-hidden /></button>
      </div>
      <div className={styles.monthBar}>
        <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Arrow left /></button>
        <span>{format(`${month}-01`, { month: "long", year: "numeric" })}</span>
        <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><Arrow /></button>
      </div>
      <div className={styles.grid}>
        {WEEKDAYS.map(day => <span key={day} className={styles.weekday}>{day}</span>)}
        {cells.map((iso, index) => iso
          ? <span key={iso} className={styles.dayCell} data-range={!singleDay && !!end && start !== end && iso >= start && iso <= end} data-start={iso === start} data-end={iso === end}>
            <button type="button" className={styles.day} aria-label={format(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            aria-pressed={iso === start || (!singleDay && iso === end)}
            disabled={!!((min && iso < min) || (max && iso > max) || (!singleDay && !end && start && (iso < start || iso > lastDeparture)))} onClick={() => pick(iso)}>{Number(iso.slice(8))}</button></span>
          : <span key={`blank-${index}`} />)}
      </div>
      <button type="button" className={styles.set} disabled={singleDay ? !start : !end} onClick={() => { if (singleDay && start) onSubmit(start, start); else if (end) onSubmit(start, end); }}>Submit</button>
    </div>
  </div>;
}
