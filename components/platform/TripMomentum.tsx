"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import toggleStyles from "./GolfTripCompetition.module.css";
import notificationStyles from "./GolfTripNotifications.module.css";
import { countdownParts } from "@/lib/platform/momNotifications";
import { draftBoard, type TeamDraft } from "@/lib/platform/teamDraft";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import styles from "./TripMomentum.module.css";
import { TripDraftRoom, type DraftRoomPlayer } from "./TripDraftRoom";

// A one-second clock; the server has no clock (null), so nothing time-based flashes a placeholder while loading.
const subscribe = (tick: () => void) => { const id = window.setInterval(tick, 1000); return () => window.clearInterval(id); };
const nowSeconds = () => Math.floor(Date.now() / 1000);
const pad = (value: number) => String(value).padStart(2, "0");
const localStamp = (seconds: number) => {
  const date = new Date(seconds * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const shiftStamp = (stamp: string, seconds: number) => new Date(Date.parse(`${stamp.length === 16 ? `${stamp}:00` : stamp}Z`) + seconds * 1000).toISOString().slice(0, 19);
/** The device's short time zone name ("CDT"), shown after the draft time. */
const zoneName = () => new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find(part => part.type === "timeZoneName")?.value ?? "";

// Push reminder opt-ins per trip (preview: kept on this device until reminders are saved with the trip).
const REMINDER_KEY = "golfTripDraftReminder";
const REMINDER_EVENT = "golf-trip-draft-reminder";
const readRaw = () => { try { return window.localStorage.getItem(REMINDER_KEY) ?? "{}"; } catch { return "{}"; } };
const parseReminders = (raw: string): Record<string, boolean> => { try { return JSON.parse(raw) as Record<string, boolean>; } catch { return {}; } };
const subscribeReminders = (change: () => void) => {
  window.addEventListener("storage", change); window.addEventListener(REMINDER_EVENT, change);
  return () => { window.removeEventListener("storage", change); window.removeEventListener(REMINDER_EVENT, change); };
};

/**
 * Momentum: Home's billboard, an 80px strip edge to edge in the maroon head (where the Mom section was), no box.
 * Before a team draft: Team Draft. During the trip: the latest golf highlights, one at a time (10 s each).
 * Otherwise: the Mom section (`fallback`: my notifications, the countdown to the trip, the next round).
 */
export function TripMomentum({ draft, startAt, editHref, events, fallback, players = [] }: {
  draft?: TeamDraft;
  players?: DraftRoomPlayer[];
  /** Dev trip clock "YYYY-MM-DDTHH:mm[:ss]": time starts there when the page loads and ticks on from it. */
  startAt?: string;
  /** The organizer's link to the draft settings (only pass it for the organizer); no link = no Edit. */
  editHref?: string;
  /** Round highlights (big plays), newest first. */
  events: MomentumEvent[];
  fallback: ReactNode;
}) {
  const seconds = useSyncExternalStore(subscribe, nowSeconds, () => null);
  const [loadedAt] = useState(nowSeconds);
  const now = seconds === null ? null : startAt ? shiftStamp(startAt, seconds - loadedAt) : localStamp(seconds);
  const board = draftBoard(draft, now);
  const content = board ? <DraftStrip draft={draft!} board={board} now={now} editHref={editHref} players={players} />
    : events.length ? <HighlightStrip events={events} turn={seconds === null ? 0 : Math.floor(seconds / 10)} />
    : fallback;
  return <section id="momentum" className={styles.momentum} aria-label="Momentum">{content}</section>;
}

/** Before the draft: Team Draft · day and time (Edit for the organizer), then the countdown with Draft Room. */
function DraftStrip({ draft, board, now, editHref, players }: { players: DraftRoomPlayer[]; draft: TeamDraft; board: { when: string | null; target: string | null }; now: string | null; editHref?: string }) {
  const zone = useSyncExternalStore(subscribe, zoneName, () => "");
  const [roomOpen, setRoomOpen] = useState(false);
  const parts = board.target && now ? countdownParts(board.target, now.length === 16 ? `${now}:00` : now) : null;
  const units = [["Days", parts?.days], ["Hrs", parts?.hours], ["Mins", parts?.minutes], ["Secs", parts?.seconds]] as const;
  return <div className={styles.draft}>
    <div className={styles.draftTop}>
      <span className={styles.draftTitle}>Team Draft</span>
      <span className={styles.draftWhen} role="status">{draftWhen(draft, board, zone)}</span>
      {editHref && <Link href={editHref} className={styles.edit}>Edit</Link>}
    </div>
    <div className={styles.draftBottom}>
      <div className={styles.countdown} role="timer" aria-label={parts ? `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until the draft` : "Countdown to the draft"}>
        {units.map(([label, value], index) => <div key={label} className={styles.unitWrap}>
          {index > 0 && <span className={styles.colon} aria-hidden>:</span>}
          <span className={styles.unit}>
            <span className={styles.digits} aria-hidden>{value === undefined ? "--" : pad(value)}</span>
            <span className={styles.label} aria-hidden>{label}</span>
          </span>
        </div>)}
      </div>
      <button type="button" className={styles.room} onClick={() => setRoomOpen(true)}>Draft Room</button>
    </div>
    {roomOpen && <TripDraftRoom players={players} draftType={draft.type} onClose={() => setRoomOpen(false)} />}
  </div>;
}

/** "Mon, Dec 20th @ 09:15 PM CDT · Snake", or "Draft date not set yet". */
function draftWhen(draft: TeamDraft, board: { when: string | null }, zone: string): string {
  return board.when ? `${board.when}${zone && board.when.includes("@") ? ` ${zone}` : ""} · ${draft.type}` : "Draft date not set yet";
}

/**
 * The header's Notifications panel, before a team draft: "Team Draft" with when it is, and a push reminder to turn on.
 * Nothing once the draft has started (or when teams aren't picked by draft).
 */
export function TeamDraftNotice({ draft, tripKey, startAt }: { draft?: TeamDraft; tripKey: string; startAt?: string }) {
  const seconds = useSyncExternalStore(subscribe, nowSeconds, () => null);
  const [loadedAt] = useState(nowSeconds);
  const now = seconds === null ? null : startAt ? shiftStamp(startAt, seconds - loadedAt) : localStamp(seconds);
  const zone = useSyncExternalStore(subscribe, zoneName, () => "");
  const remind = parseReminders(useSyncExternalStore(subscribeReminders, readRaw, () => "{}"))[tripKey] ?? false;
  const board = draftBoard(draft, now);
  if (!board || !draft) return null;
  const toggleReminder = () => {
    const next = { ...parseReminders(readRaw()), [tripKey]: !remind };
    try { window.localStorage.setItem(REMINDER_KEY, JSON.stringify(next)); } catch { /* storage blocked: the choice isn't kept */ }
    window.dispatchEvent(new Event(REMINDER_EVENT));
  };
  return <section className={`${notificationStyles.notifications} ${styles.notice}`} aria-label="Team Draft">
    <h2 className={notificationStyles.categoryTitle}>Team Draft</h2>
    <p>{draftWhen(draft, board, zone)}</p>
    <div className={notificationStyles.row}>
      <span className={notificationStyles.label}>Push reminder</span>
      <button type="button" role="switch" aria-checked={remind} aria-label="Push reminder for the team draft" className={toggleStyles.toggle} onClick={toggleReminder}>
        <span className={toggleStyles.track} data-on={remind}><span className={toggleStyles.thumb} /></span><span>{remind ? "On" : "Off"}</span>
      </button>
    </div>
  </section>;
}

/** During the trip: the newest highlights, one at a time — headline over its line ("Heating Up!" / "3 birdies in a row for Cam"). */
function HighlightStrip({ events, turn }: { events: MomentumEvent[]; turn: number }) {
  const shown = events.slice(0, 5);
  const event = shown[turn % shown.length];
  return <div key={shown.length > 1 ? turn : event.id} className={`${styles.highlight} ${shown.length > 1 ? styles.rotating : ""}`} role="status" aria-live="polite">
    <span className={styles.highlightTitle}>{event.title}</span>
    <span className={styles.highlightDetail}>{event.detail}</span>
  </div>;
}
