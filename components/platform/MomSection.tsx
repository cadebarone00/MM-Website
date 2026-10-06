"use client";

import { useState, useSyncExternalStore } from "react";
import { countdownParts, countdownTarget, momNotes, pickLine } from "@/lib/platform/momNotifications";
import type { TripTravel } from "@/lib/platform/tripTravel";
import styles from "./MomSection.module.css";

// A one-second clock shared by every Mom section on the page; the server has no clock (null), so nothing time-based renders there.
const subscribe = (tick: () => void) => { const id = window.setInterval(tick, 1000); return () => window.clearInterval(id); };
const nowSeconds = () => Math.floor(Date.now() / 1000);
const pad = (value: number) => String(value).padStart(2, "0");
/** Device-local wall time "YYYY-MM-DDTHH:mm:ss" (trip times are wall times too). */
const localStamp = (seconds: number) => {
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** A trip-clock stamp moved on by `seconds`. */
const shiftStamp = (stamp: string, seconds: number) => new Date(Date.parse(`${stamp}Z`) + seconds * 1000).toISOString().slice(0, 19);

/**
 * Home's Mom section: my live notifications as one cream line (with a small button when there's a link), rotating every
 * 10 seconds — 500 ms fade out, then the next fades in over 500 ms. With no notifications, a flip-clock countdown
 * (Days · Hrs · Min · Sec) to the first plan on arrival day, or 7:00 AM that day. Nothing once that time has come.
 */
export function MomSection({ travel, arrivalDay, plans, startAt }: {
  travel?: TripTravel; arrivalDay?: string; plans: { startsAt: string }[];
  /** Dev trip clock "YYYY-MM-DDTHH:mm:ss": time starts there when the page loads and ticks on from it. */
  startAt?: string;
}) {
  const seconds = useSyncExternalStore(subscribe, nowSeconds, () => null);
  const [loadedAt] = useState(nowSeconds);
  const now = seconds === null ? null : startAt ? shiftStamp(startAt, seconds - loadedAt) : localStamp(seconds);
  const notes = travel && now ? momNotes(travel, now.slice(0, 16)) : [];

  if (notes.length) {
    const turn = seconds === null ? 0 : Math.floor(seconds / 10);
    const note = notes[turn % notes.length];
    // Keyed by turn so each new note mounts and plays the 10-second fade in / hold / fade out.
    return <div className={styles.mom} role="status" aria-live="polite">
      <div key={notes.length > 1 ? turn : note.id} className={`${styles.note} ${notes.length > 1 ? styles.rotating : ""}`}>
        <span className={styles.line}>{pickLine(note, turn)}</span>
        {note.action && <a className={styles.action} href={note.action.url} target="_blank" rel="noopener noreferrer">{note.action.label}</a>}
      </div>
    </div>;
  }

  // The countdown only appears once the device clock is known (no placeholder flash while the page loads) and only while
  // the target is still ahead — a trip that has started or is over shows nothing here.
  const target = countdownTarget(arrivalDay, plans);
  const parts = target && now ? countdownParts(target, now) : null;
  if (!parts) return null;
  const units = [["Days", parts.days], ["Hrs", parts.hours], ["Min", parts.minutes], ["Sec", parts.seconds]] as const;
  return <div className={styles.mom} role="timer" aria-label={`${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until the trip`}>
    <div className={styles.countdown}>
      {units.map(([label, value]) => <div key={label} className={styles.unit}>
        <span className={styles.tile} aria-hidden>{pad(value)}</span>
        <span className={styles.label} aria-hidden>{label}</span>
      </div>)}
    </div>
  </div>;
}
