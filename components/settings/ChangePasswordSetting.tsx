"use client";

import Link from "next/link";
import { useState } from "react";
import { checkNewPassword, PASSWORD_HINT } from "@/lib/auth/passwordPolicy";
import settings from "./Settings.module.css";
import styles from "./DeleteAccount.module.css";

/**
 * Settings → Account → Change password (Accounts V2, phase A2). Needs the current password; forgot it → the
 * forgot-password email. On success every other device is signed out (this one stays signed in).
 * `onSave` (dev preview only) answers locally instead of calling the server.
 */
export function ChangePasswordSetting({ onSave }: { onSave?: (current: string, next: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const rules = next ? checkNewPassword(next) : null;
  const mismatch = again.length > 0 && again !== next;
  const ready = !!current && rules?.ok === true && again === next && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const answer = onSave ? await onSave(current, next) : await (async () => {
        const response = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
        const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
        return { ok: response.ok && !!body?.ok, error: body?.error };
      })();
      if (!answer.ok) { setError(answer.error ?? "We couldn't change your password. Try again."); return; }
      setDone(true);
      setOpen(false);
      setCurrent(""); setNext(""); setAgain("");
    } catch {
      // The request may or may not have reached us: say so honestly.
      setError("The connection dropped. Your password may already have changed: try your new password first; if it doesn't work, your old one still does.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return <div className={styles.row}>
      <button type="button" className={settings.secondary} onClick={() => { setOpen(true); setDone(false); }}>Change password</button>
      {done && <p className={settings.note} role="status">Password changed. You&apos;ve been signed out on your other devices.</p>}
    </div>;
  }

  return <div aria-labelledby="change-password-title">
    <p id="change-password-title" className={styles.subhead}>Change password</p>
    <label className={styles.label}>Current password
      <input className={styles.input} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={saving} />
    </label>
    <p className={settings.note}><Link href="/forgot-password">Forgot it? Get a reset email</Link></p>
    <label className={styles.label}>New password
      <input className={styles.input} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={saving} aria-describedby="new-password-hint" />
    </label>
    <p id="new-password-hint" className={settings.note}>{rules && !rules.ok ? rules.error : PASSWORD_HINT}</p>
    <label className={styles.label}>New password again
      <input className={styles.input} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} disabled={saving} />
    </label>
    {mismatch && <p className={settings.note}>The new passwords don&apos;t match yet.</p>}
    {error && <p className={settings.error} role="alert">{error}</p>}
    <div className={styles.row} style={{ marginTop: 12 }}>
      <button type="button" className={settings.primary} disabled={!ready} onClick={save}>{saving ? "Changing…" : "Change password"}</button>
      <button type="button" className={settings.secondary} disabled={saving} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
    </div>
    <p className={settings.note}>Changing it signs you out on your other devices.</p>
  </div>;
}
