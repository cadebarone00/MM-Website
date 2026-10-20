"use client";

import { useState } from "react";
import styles from "./WebsiteAccountActions.module.css";

export function WebsiteAccountActions({ signedIn }: { signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok || !(await response.json()).ok) throw new Error("Sign out failed");
      window.location.replace("/login/email?next=%2Fdashboard");
    } catch { setError(true); setBusy(false); }
  }
  return <span className={styles.account}>
    <a className={styles.link} href={signedIn ? "/dashboard" : "/login/email?next=%2Fdashboard"}>{signedIn ? "My Dashboard" : "Sign In"}</a>
    {signedIn && <button type="button" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign Out"}</button>}
    {error && <span role="alert">Could not sign out. Try again.</span>}
  </span>;
}
