"use client";
import Link from "next/link";
import type { AppData } from "./useAppData";
import styles from "./App.module.css";

/** Loading / couldn't-load / not-found for an app screen, with Try again. */
export function AppStatus({ state, onRetry }: { state: Exclude<AppData<unknown>, { status: "ok" }>; onRetry: () => void }) {
  if (state.status === "loading") return <p className={styles.status} aria-busy="true">Loading…</p>;
  if (state.code === 404) return <main className={styles.center}><h1 className={styles.title}>Trip not found</h1>
    <p className={styles.text}>It may have been deleted, or you&apos;re not on it.</p><Link className={styles.primary} href="/golf-trips/">Golf Trips</Link></main>;
  return <main className={styles.center}><p className={styles.text} role="alert">{state.error}</p>
    <button type="button" className={styles.primary} onClick={onRetry}>Try again</button></main>;
}
