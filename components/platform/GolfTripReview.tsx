"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { golfTripDraftSnapshot, parseGolfTripDraft, readGolfTripDraft, reviewRows, saveGolfTripDraft } from "@/lib/platform/golfTripDraft";
import { GolfTripInviteDialog } from "./GolfTripInviteDialog";
import styles from "./CreateTournament.module.css";

/** The draft only changes when a step's Next is tapped, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

type CreateState = { status: "idle" | "creating" } | { status: "created"; tripId: string; url: string }
  | { status: "error"; message: string; needsLogin: boolean };

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
  const [state, setState] = useState<CreateState>({ status: "idle" });
  const inFlight = useRef(false);
  // Used only when this browser blocks storage, so retries still reuse one id.
  const fallbackRequestId = useRef<string | null>(null);

  async function createTrip() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ status: "creating" });

    const answers = readGolfTripDraft();
    if (!answers.requestId) {
      answers.requestId = fallbackRequestId.current ??= crypto.randomUUID();
      saveGolfTripDraft({ requestId: answers.requestId });
    }

    try {
      const response = await fetch("/api/golf-trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers) });
      const result: unknown = await response.json().catch(() => null);
      const { ok, tripId, url, error } = (result ?? {}) as { ok?: boolean; tripId?: unknown; url?: unknown; error?: unknown };
      if (response.ok && ok && typeof url === "string") {
        // Stays locked (inFlight) from here until the trip opens.
        if (typeof tripId === "string" && isGolfTripId(tripId)) setState({ status: "created", tripId, url });
        else router.replace(url);
        return;
      }
      setState({ status: "error", needsLogin: response.status === 401,
        message: typeof error === "string" ? error : "We couldn't create your trip. Your answers are still here, so try again." });
    } catch {
      setState({ status: "error", needsLogin: false, message: "Couldn't reach the server. Check your connection and try again. Your answers are still here." });
    }
    inFlight.current = false;
  }

  const creating = state.status === "creating" || state.status === "created";
  return <main className={styles.review}>
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
  </main>;
}
