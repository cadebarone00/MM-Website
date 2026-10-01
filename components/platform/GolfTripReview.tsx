"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { golfTripDraftSnapshot, parseGolfTripDraft, readGolfTripDraft, reviewRows, saveGolfTripDraft } from "@/lib/platform/golfTripDraft";
import styles from "./CreateTournament.module.css";

/** The draft only changes when a step's Next is tapped, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

type CreateState = { status: "idle" | "creating" } | { status: "error"; message: string; needsLogin: boolean };

/**
 * Golf Trip questionnaire, Review: fully maroon, every answer as a label / value row, top to bottom, then
 * Create Golf Trip. Create sends the draft with a request id kept in the draft, so a double tap or a retry
 * returns the same trip; a failed save leaves every answer in place.
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
      const { ok, url, error } = (result ?? {}) as { ok?: boolean; url?: unknown; error?: unknown };
      if (response.ok && ok && typeof url === "string") {
        router.replace(url); // stays "creating" (and locked) until the trip opens
        return;
      }
      setState({ status: "error", needsLogin: response.status === 401,
        message: typeof error === "string" ? error : "We couldn't create your trip. Your answers are still here, so try again." });
    } catch {
      setState({ status: "error", needsLogin: false, message: "Couldn't reach the server. Check your connection and try again. Your answers are still here." });
    }
    inFlight.current = false;
  }

  const creating = state.status === "creating";
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
  </main>;
}
