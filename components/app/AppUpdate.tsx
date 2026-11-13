"use client";

import { useEffect, useState, type ReactNode } from "react";
import { APP_BUILD } from "@/lib/app/appVersion";
import styles from "./App.module.css";

/**
 * Once, when the app opens: if the server says this build is too old (/api/app/version), shows "Update The Maroon"
 * instead of the app. If the check can't be made (offline), the app opens as normal.
 */
export function AppUpdate({ children }: { children: ReactNode }) {
  const [tooOld, setTooOld] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/app/version", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { data?: { minimum?: number } }) => { if (alive && (body.data?.minimum ?? 0) > APP_BUILD) setTooOld(true); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!tooOld) return children;
  return <main className={styles.center}>
    <h1 className={styles.title}>Update The Maroon</h1>
    <p className={styles.text}>There&apos;s a new version of the app. Update it in TestFlight or the App Store to keep going.</p>
  </main>;
}
