"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  DISTANCE_UNITS, NOTIFICATION_TYPES, SCORE_ENTRIES, TEE_CHOICES, applyPreferenceChange,
  type NotificationChannel, type NotificationType, type PreferenceChange, type Preferences,
} from "@/lib/profile/preferences";
import styles from "./Settings.module.css";

/** Saves one change and returns the saved preferences (throws to show an error). Live = PUT /api/account/preferences. */
export type SavePreference = (change: PreferenceChange) => Promise<Preferences>;
export const saveAccountPreference: SavePreference = async (change) => {
  const response = await fetch("/api/account/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
  const body = await response.json().catch(() => null) as { ok?: boolean; preferences?: Preferences; error?: string } | null;
  if (!response.ok || !body?.ok || !body.preferences) throw new Error(body?.error ?? "Couldn't save that. Try again.");
  return body.preferences;
};

/** Shows the change straight away, saves it, and goes back if saving fails. */
function usePreferences(initial: Preferences, save: SavePreference) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  async function change(next: PreferenceChange) {
    const before = prefs;
    setPrefs(applyPreferenceChange(prefs, next)); setError(null);
    try { setPrefs(await save(next)); } catch (problem) { setPrefs(before); setError(problem instanceof Error ? problem.message : "Couldn't save that. Try again."); }
  }
  return { prefs, change, error };
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={styles.switch} onClick={() => onChange(!on)}><span className={styles.switchKnob} /></button>;
}

/** Settings → Notifications: Push and Email for each kind of alert. */
export function NotificationSettings({ initial, save = saveAccountPreference }: { initial: Preferences; save?: SavePreference }) {
  const { prefs, change, error } = usePreferences(initial, save);
  const set = (notification: NotificationType, channel: NotificationChannel, on: boolean) => void change({ notification, channel, on });
  return <div>
    <div className={styles.notifyHead} aria-hidden="true"><span /><span>Push</span><span>Email</span></div>
    <ul className={styles.notifyList}>
      {NOTIFICATION_TYPES.map(({ id, label }) => <li key={id} className={styles.notifyRow}>
        <span className={styles.notifyLabel}>{label}</span>
        <Switch on={prefs.notifications[id].push} label={`${label}: phone alerts`} onChange={(on) => set(id, "push", on)} />
        <Switch on={prefs.notifications[id].email} label={`${label}: emails`} onChange={(on) => set(id, "email", on)} />
      </li>)}
    </ul>
    <p className={styles.note}>Phone alerts start with the App Store app. Today only friend-request emails are sent; the rest follow these switches as they arrive. Messages from your trip organizer always come through.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}

/** Settings → Golf preferences: distance, usual tees, score entry. */
export function GolfPreferences({ initial, save = saveAccountPreference }: { initial: Preferences; save?: SavePreference }) {
  const { prefs, change, error } = usePreferences(initial, save);
  return <div className={styles.prefGroups}>
    <div>
      <p className={styles.fieldLabel} id="pref-distance">Distance</p>
      <div className={styles.segmented} role="group" aria-labelledby="pref-distance">
        {DISTANCE_UNITS.map((d) => <button key={d.id} type="button" aria-pressed={prefs.distance === d.id} onClick={() => void change({ distance: d.id })}>{d.label}</button>)}
      </div>
    </div>
    <div>
      <p className={styles.fieldLabel} id="pref-tees">Usual tees</p>
      <div className={styles.chips} role="group" aria-labelledby="pref-tees">
        {(["", ...TEE_CHOICES] as const).map((tee) => <button key={tee || "none"} type="button" aria-pressed={prefs.usualTees === tee} onClick={() => void change({ usualTees: tee })}>
          {tee ? <><span className={styles.teeDot} data-tee={tee} aria-hidden="true" />{tee}</> : "None"}
        </button>)}
      </div>
      <p className={styles.note}>New rounds start on these when the course has them.</p>
    </div>
    <div>
      <p className={styles.fieldLabel} id="pref-entry">Score entry</p>
      <div className={styles.segmented} role="group" aria-labelledby="pref-entry">
        {SCORE_ENTRIES.map((s) => <button key={s.id} type="button" aria-pressed={prefs.scoreEntry === s.id} onClick={() => void change({ scoreEntry: s.id })}>{s.label}</button>)}
      </div>
      <p className={styles.note}>{SCORE_ENTRIES.find((s) => s.id === prefs.scoreEntry)?.hint}</p>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}

/** Settings → Help & legal. Terms and Privacy are "Coming soon" until they're written (readiness checklist #49). */
export function HelpLegal({ version }: { version: string }) {
  return <ul className={styles.rowList}>
    <li><Link href="/contact" className={styles.row}><span>Contact us</span><ChevronRight size={18} aria-hidden="true" /></Link></li>
    <li><span className={`${styles.row} ${styles.rowOff}`}><span>Terms of Service</span><span className={styles.soonTag}>Coming soon</span></span></li>
    <li><span className={`${styles.row} ${styles.rowOff}`}><span>Privacy Policy</span><span className={styles.soonTag}>Coming soon</span></span></li>
    <li><span className={styles.row}><span>App version</span><span className={styles.muted}>{version}</span></span></li>
  </ul>;
}
