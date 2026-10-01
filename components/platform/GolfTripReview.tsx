"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { golfTripDraftSnapshot, parseGolfTripDraft, reviewRows } from "@/lib/platform/golfTripDraft";
import styles from "./CreateTournament.module.css";

/** The draft only changes when a step's Next is tapped, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/** Golf Trip questionnaire, Review: fully maroon, every answer as a label / value row, top to bottom. */
export function GolfTripReview() {
  const draft = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const rows = useMemo(() => reviewRows(parseGolfTripDraft(draft)), [draft]);

  return <main className={styles.review}>
    <dl className={styles.reviewList}>
      {rows.map((row) => <div key={row.label} className={styles.reviewRow}>
        <dt className={styles.reviewLabel}>{row.label}</dt>
        <dd className={`${styles.reviewValue} ${row.value === "Not set" ? styles.reviewEmpty : ""}`}>{row.value}</dd>
      </div>)}
    </dl>
    <Link href="/golf-trips/new/transportation" className={styles.back}>Back</Link>
  </main>;
}
