"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { golfTripDraftSnapshot, parseGolfTripDraft, reviewRows } from "@/lib/platform/golfTripDraft";
import { useCreateGolfTrip } from "@/lib/platform/useCreateGolfTrip";
import { GolfTripInviteDialog } from "./GolfTripInviteDialog";
import styles from "./CreateTournament.module.css";
import { SetupSheet } from "./SetupSheet";

/** The draft only changes when a step's Next is tapped, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/**
 * Golf Trip questionnaire, Review: fully maroon, every answer as a label / value row, top to bottom, then
 * Create Golf Trip. Create sends the draft with a request id kept in the draft, so a double tap or a retry
 * returns the same trip; a failed save leaves every answer in place. A saved trip shows the
 * Congratulations / Invite your group popup, which then opens the trip.
 */
export function GolfTripReview() {
  const router = useRouter();
  const draft = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const rows = useMemo(() => reviewRows(parseGolfTripDraft(draft)), [draft]);
  const { state, createTrip } = useCreateGolfTrip();

  const creating = state.status === "creating" || state.status === "created";
  return <SetupSheet label="Review" wizardStep={8}>
    <dl className={styles.reviewList}>
      {rows.map((row) => <div key={row.label} className={styles.reviewRow}>
        <dt className={styles.reviewLabel}>{row.label}</dt>
        <dd className={`${styles.reviewValue} ${row.value === "Not set" ? styles.reviewEmpty : ""}`}>{row.value}</dd>
      </div>)}
    </dl>
    {state.status === "error" && <p className={styles.reviewError} role="alert">
      {state.message}{state.needsLogin && <> <Link href="/login">Log in</Link></>}
    </p>}
    <div className={styles.reviewActions}>
      <Link href="/golf-trips/new/transportation" className={styles.back} aria-disabled={creating}
        onClick={(event) => { if (creating) event.preventDefault(); }}>Back</Link>
      <button type="button" className={`${styles.continue} ${styles.start}`} onClick={createTrip} disabled={creating} aria-busy={creating}>
        {creating ? "Creating your trip…" : "Create Golf Trip"}
      </button>
    </div>
    {state.status === "created" && <GolfTripInviteDialog tripId={state.tripId} url={state.url} onDone={() => router.replace(state.url)} />}
  </SetupSheet>;
}
