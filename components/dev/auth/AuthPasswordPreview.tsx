"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { PASSWORD_MIN_CHARS, checkNewPassword } from "@/lib/auth/passwordPolicy";
import frame from "./AuthNamePreview.module.css";
import { signUpProgress } from "@/lib/dev/authScreens";
import styles from "./AuthPasswordPreview.module.css";

/** DEV ONLY: Authentication screen "Create password" (signup step, with the progress bar) and, with other props,
 * "Reset password" (after the forgot-password code). Same rules as signup (lib/auth/passwordPolicy.ts); nothing is saved. */
export function AuthPasswordPreview({ title = "Create a password", nextHref = "/dev/auth/name-username", buttonLabel = "Continue", progress = true }:
  { title?: string; nextHref?: string; buttonLabel?: string; progress?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const check = checkNewPassword(password);
  const tooShort = password.length > 0 && [...password].length < PASSWORD_MIN_CHARS;
  // Short passwords are flagged straight away; anything else only once they've started confirming.
  const problem = tooShort ? `At least ${PASSWORD_MIN_CHARS} characters.`
    : !confirm ? null : !check.ok ? check.error : confirm !== password ? "Passwords don't match." : null;
  const ready = check.ok && confirm === password;

  return <main className={frame.page}>
    <div className={`${frame.logo} ${progress ? "" : styles.noProgressLogo}`}><MaroonMark color="#fbf8f1" /></div>
    {progress && <div className={frame.progress} aria-hidden="true"><span style={{ width: signUpProgress("password") }} /></div>}
    <h1 className={frame.title}>{title}</h1>
    <form className={frame.fields} onSubmit={(e) => { e.preventDefault(); if (ready) router.push(nextHref); }}>
      <PasswordField label="Password" value={password} onChange={setPassword} autoFocus />
      <PasswordField label="Confirm Password" value={confirm} onChange={setConfirm} />
      {/* Always rendered so the button below never moves when a message appears. */}
      <p className={frame.error} role="alert">{problem}</p>
      <button type="submit" className={frame.continue} disabled={!ready}>{buttonLabel}</button>
    </form>
  </main>;
}

/** A password box with a show/hide eye (Create password and Reset password). */
export function PasswordField({ label, value, onChange, autoFocus, autoComplete = "new-password" }: { label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean; autoComplete?: string }) {
  const [shown, setShown] = useState(false);
  return <label className={`${frame.field} ${styles.passwordField}`}><span>{label}</span>
    <input type={shown ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} autoFocus={autoFocus}
      value={value} onChange={(e) => onChange(e.target.value)} />
    <button type="button" className={styles.eye} aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={shown}
      onClick={() => setShown(!shown)}>{shown ? <EyeOffIcon /> : <EyeIcon />}</button>
  </label>;
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>;
}

function EyeOffIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
