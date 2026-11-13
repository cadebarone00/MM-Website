import Link from "next/link";
import { shareOrigin } from "@/lib/app/shareOrigin";
import styles from "./App.module.css";

/** Wagers and Fantasy stay out of the app for now (owner decision 2026-11-10, Apple's rules on betting): no link out. */
export const keptOutOfApp = (path: string) => ["/wagers", "/fantasy"].some((page) => path === page || path.startsWith(`${page}/`));

/** A page that isn't in the iPhone / Android app: Wagers and Fantasy say so; anything else can be opened on the website. */
export function AppComingSoon({ path }: { path: string }) {
  const keptOut = keptOutOfApp(path);
  return <main className={styles.center}>
    <h1 className={styles.title}>Not in the app</h1>
    <p className={styles.text}>{keptOut ? "This part of The Maroon isn't in the app." : "This part of The Maroon is on the website."}</p>
    {!keptOut && <a className={styles.primary} href={`${shareOrigin()}${path}`} target="_blank" rel="noreferrer">Open on the website</a>}
    <Link className={keptOut ? styles.primary : styles.secondary} href="/golf-trips/">Go to Golf Trips</Link>
  </main>;
}
