"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TRAVEL_MODES, type TravelMode } from "@/lib/platform/golfTripDetails";
import { DestinationSearch } from "./DestinationSearch";
import fieldStyles from "./CreateTournament.module.css";
import styles from "./GolfTripSettingsPreview.module.css";

/**
 * General Settings → Trip: the trip's name, destination and how everyone's getting there. The organizer changes them
 * and taps Save; everyone else sees them locked. A saved trip saves to PATCH /api/golf-trips/<id>/details; the dev
 * preview (no tripId) only keeps them on screen.
 */
export function TripDetailsForm({ tripId, name, destination, travel, readOnly }: {
  tripId: string | null; name: string; destination: string; travel: TravelMode; readOnly: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<TravelMode>(travel);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || saving) return;
    const form = new FormData(event.currentTarget);
    const body = { ...Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)])), travelMode: mode };
    if (!tripId) { setStatus({ text: "Saved (preview only)", error: false }); return; }
    setSaving(true); setStatus({ text: "Saving…", error: false });
    try {
      const response = await fetch(`/api/golf-trips/${tripId}/details`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Couldn't save trip details. Try again.");
      setStatus({ text: "Saved", error: false });
      router.refresh();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Couldn't save trip details. Try again.", error: true });
    } finally { setSaving(false); }
  }

  return <form className={fieldStyles.fields} aria-label="Trip details" onSubmit={save}>
    <label className={fieldStyles.field}>
      <span className={fieldStyles.fieldLabel}>Trip Name</span>
      <input className={fieldStyles.input} type="text" name="tripName" defaultValue={name} maxLength={120} autoComplete="off" required disabled={readOnly} />
    </label>
    <DestinationSearch initial={destination} disabled={readOnly} />
    <div className={styles.teamSelection} role="group" aria-label="How's everyone getting there?">
      <span className={styles.typeHeading}>How&apos;s everyone getting there?</span>
      <div className={styles.tieChoices}>
        {TRAVEL_MODES.map(option => <button key={option.value} type="button" className={styles.typeChoice} aria-pressed={mode === option.value} disabled={readOnly}
          onClick={() => setMode(option.value)}>{option.label}</button>)}
      </div>
    </div>
    {!readOnly && <button type="submit" className={styles.goldSave} disabled={saving}>Save trip details</button>}
    {status && <p role={status.error ? "alert" : "status"} className={styles.statNote}>{status.text}</p>}
  </form>;
}
