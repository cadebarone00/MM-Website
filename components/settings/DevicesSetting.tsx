"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import settings from "./Settings.module.css";
import styles from "./DeleteAccount.module.css";

type Scope = "others" | "global";
const LABEL: Record<Scope, string> = { others: "Sign out of other devices", global: "Sign out everywhere" };
const EXPLAIN: Record<Scope, string> = {
  others: "Every other phone, tablet and browser is signed out. You stay signed in here.",
  global: "Every device is signed out, this one too. Use this if you think someone else has your account.",
};

/**
 * Settings → Account → Devices (Accounts V2, phase A4). Normal Sign Out (bottom of Settings) is this device only; these
 * two are the security options. Both need your password.
 */
export function DevicesSetting() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function confirm() {
    if (!scope) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, password }) });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) { setError(body?.error ?? "We couldn't sign out your devices. Try again."); return; }
      if (scope === "global") { router.push("/login"); router.refresh(); return; }
      setDone("Your other devices are signed out.");
      setScope(null);
      setPassword("");
    } catch {
      setError("The connection dropped. Your devices may already be signed out; try again to be sure.");
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <p className={styles.subhead}>Devices</p>
    {!scope ? <div className={styles.row}>
      <button type="button" className={settings.secondary} onClick={() => { setScope("others"); setDone(null); setError(null); }}>{LABEL.others}</button>
      <button type="button" className={settings.secondary} onClick={() => { setScope("global"); setDone(null); setError(null); }}>{LABEL.global}</button>
      {done && <p className={settings.note} role="status">{done}</p>}
    </div> : <div>
      <p className={settings.text}>{EXPLAIN[scope]}</p>
      <label className={styles.label}>Password
        <input className={styles.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      </label>
      {error && <p className={settings.error} role="alert">{error}</p>}
      <div className={styles.row} style={{ marginTop: 12 }}>
        <button type="button" className={settings.primary} disabled={!password || busy} onClick={confirm}>{busy ? "Signing out…" : LABEL[scope]}</button>
        <button type="button" className={settings.secondary} disabled={busy} onClick={() => { setScope(null); setPassword(""); setError(null); }}>Cancel</button>
      </div>
    </div>}
  </div>;
}
