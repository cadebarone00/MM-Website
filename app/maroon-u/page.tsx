import type { Metadata } from "next";
import Link from "next/link";
import styles from "../golf-trips/page.module.css";

export const metadata: Metadata = { title: "The Maroon U | The Maroon" };

export default function MaroonUPage() {
  return <main className={styles.page}>
    <div className={styles.band}><h1 className={styles.title}>The Maroon U</h1></div>
    <div className={styles.content}>
      <section className={styles.join} aria-labelledby="coming-soon">
        <h2 id="coming-soon" className={styles.joinLabel}>Coming soon</h2>
        <p className={styles.joinHint}>This page is a placeholder for The Maroon U.</p>
        <Link href="/golf-trips" className={styles.row}>Back to Golf Trips</Link>
      </section>
    </div>
  </main>;
}
