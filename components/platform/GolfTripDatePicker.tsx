"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import styles from "./GolfTripDatePicker.module.css";
import wheels from "./TeeTimePicker.module.css";
import { Wheel } from "./TeeTimePicker";

/** Solid triangle arrow (a filled-in < or >) for the month buttons. */
const Arrow = ({ left }: { left?: boolean }) => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d={left ? "M10 1.5 3 7l7 5.5z" : "M4 1.5 11 7l-7 5.5z"} fill="currentColor" /></svg>;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const plusDays = (iso: string, by: number) => { const date = toDate(iso); date.setUTCDate(date.getUTCDate() + by); return toIso(date); };
const format = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(toDate(iso));

/**
 * Cream month calendar in a popup for a trip's dates (YYYY-MM-DD). Tap the arrival day, the title switches to
 * Departure, tap the departure day (up to `maxDays` long); circles mark endpoints with a translucent range between.
 * Once complete, picking any date starts a new arrival/departure range. Single-day mode submits just one date.
 * Tapping the month name slides up a second sheet under the date line: a Month wheel and a Year wheel (the time
 * picker's wheels and look, owner request 2026-11-02); Done jumps the calendar there. Years run from `min` to `max`
 * (default: 5 back / 5 ahead; `pickYear` = back to 1900, for a birthday). `openMonth` (YYYY-MM) is where the calendar
 * opens when nothing is picked yet.
 */
export function GolfTripDatePicker({ arrival, departure, maxDays, onSubmit, onClose, singleDay = false, label = "Date", min, max, pickYear = false, openMonth }: {
  arrival: string; departure: string; maxDays: number; onSubmit: (arrival: string, departure: string) => void; onClose: () => void;
  singleDay?: boolean; label?: string; min?: string; max?: string; pickYear?: boolean; openMonth?: string;
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
  const [month, setMonth] = useState(() => (arrival || openMonth || min || new Date().toLocaleDateString("en-CA")).slice(0, 7));
  const thisYear = new Date().getFullYear();
  const firstYear = Number((min || (pickYear ? "1900" : String(thisYear - 5))).slice(0, 4));
  const lastYear = Number((max || String(thisYear + 5)).slice(0, 4));
  const years = Array.from({ length: Math.max(1, lastYear - firstYear + 1) }, (_, index) => String(firstYear + index));
  const [jump, setJump] = useState<{ month: number; year: number } | null>(null); // the Month / Year sheet, while open
  const openJump = () => setJump({ month: Number(month.slice(5)) - 1, year: Math.max(0, years.indexOf(month.slice(0, 4))) });
  const first = toDate(`${month}-01`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday-first week
  // Always 6 week rows (42 cells): a month that fits in 5 gets an empty last row, so the sheet never changes height.
  const days = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)];
  const cells: (string | null)[] = [...days, ...Array(42 - days.length).fill(null)];
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
      <div className={styles.body}>
      <div className={styles.monthBar}>
        <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Arrow left /></button>
        <button type="button" className={styles.monthName} aria-haspopup="dialog" aria-label={`${format(`${month}-01`, { month: "long", year: "numeric" })}. Choose month and year`} onClick={openJump}>
          {format(`${month}-01`, { month: "long", year: "numeric" })}
        </button>
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
      <button type="button" className={styles.set} disabled={singleDay ? !start : !end} onClick={() => { if (singleDay && start) onSubmit(start, start); else if (end) onSubmit(start, end); }}>Set</button>
      {jump && <section className={styles.jump} role="dialog" aria-label="Choose month and year">
        <div className={`${wheels.wheels} ${styles.jumpWheels}`}>
          <div className={wheels.band} aria-hidden="true" />
          <Wheel label="Month" values={MONTHS} index={jump.month} width={150} onIndex={next => setJump(current => current && { ...current, month: next })} />
          <Wheel label="Year" values={years} index={jump.year} width={90} onIndex={next => setJump(current => current && { ...current, year: next })} />
        </div>
        <button type="button" className={wheels.save} onClick={() => { setMonth(`${years[jump.year]}-${String(jump.month + 1).padStart(2, "0")}`); setJump(null); }}>Done</button>
      </section>}
      </div>
    </div>
  </div>;
}
