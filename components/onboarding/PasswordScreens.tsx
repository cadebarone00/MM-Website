"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { PasswordField } from "@/components/dev/auth/AuthPasswordPreview";
import { PASSWORD_MIN_CHARS, checkNewPassword } from "@/lib/auth/passwordPolicy";
import { errorOf, rememberEmail, send, useRememberedEmail } from "@/lib/account/onboardingClient";
import { progressWidth, START } from "@/lib/account/onboardingRoutes";
import frame from "@/components/dev/auth/AuthNamePreview.module.css";
import styles from "@/components/dev/auth/AuthPasswordPreview.module.css";
import forgotStyles from "@/components/dev/auth/AuthForgotPreview.module.css";

/**
 * Pending accounts Phase 6: the real "Create a password", "Set a new password" and "Forgot password" screens — the
 * approved AuthPasswordPreview / AuthForgotPreview designs connected to the real APIs:
 * - Create a password → POST /api/auth/signup (email from Sign up) → the code email → Email Verification.
 * - Set a new password → POST /api/auth/reset-password, which only accepts a session from the reset code / link within
 *   the hour and signs every session out afterwards → Log in.
 * - Forgot password → POST /api/auth/forgot-password (same answer whether or not the address has an account) → code.
 */
export function PasswordScreen({ kind }: { kind: "create" | "reset" }) {
  const router = useRouter();
  const email = useRememberedEmail();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => { if (kind === "create" && email === "") router.replace(START.signUp); }, [kind, email, router]);

  const check = checkNewPassword(password);
  const tooShort = password.length > 0 && [...password].length < PASSWORD_MIN_CHARS;
  // Short passwords are flagged straight away; anything else only once they've started confirming.
  const problem = tooShort ? `At least ${PASSWORD_MIN_CHARS} characters.`
    : !confirm ? null : !check.ok ? check.error : confirm !== password ? "Passwords don't match." : null;
  const ready = check.ok && confirm === password && !busy && (kind === "reset" || !!email);

  async function save() {
    setBusy(true);
    setServerError(null);
    if (kind === "create") {
      const sent = await send("/api/auth/signup", { email, password, next: "/onboarding" });
      if (sent.json.ok !== true) { setServerError(errorOf(sent)); setBusy(false); return; }
      router.push(START.verify);
      return;
    }
    const sent = await send("/api/auth/reset-password", { password });
    if (sent.json.ok !== true) { setServerError(errorOf(sent)); setBusy(false); return; }
    router.replace(`${START.logIn}?reset=1`);
  }

  const progress = kind === "create";
  return <main className={frame.page}>
    <div className={`${frame.logo} ${progress ? "" : styles.noProgressLogo}`}><MaroonMark color="#fbf8f1" /></div>
    {progress && <div className={frame.progress} aria-hidden="true"><span style={{ width: progressWidth("password") }} /></div>}
    <h1 className={frame.title}>{progress ? "Create a password" : "Set a new password"}</h1>
    <form className={frame.fields} onSubmit={(e) => { e.preventDefault(); if (ready) void save(); }}>
      <PasswordField label="Password" value={password} onChange={setPassword} autoFocus />
      <PasswordField label="Confirm Password" value={confirm} onChange={setConfirm} />
      {/* Always rendered so the button below never moves when a message appears. */}
      <p className={frame.error} role="alert">{serverError ?? problem}</p>
      <button type="submit" className={frame.continue} disabled={!ready}>{busy ? "Saving…" : progress ? "Continue" : "Save password"}</button>
    </form>
  </main>;
}

export function ForgotScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && !busy;

  async function sendCode() {
    setBusy(true);
    setError(null);
    const sent = await send("/api/auth/forgot-password", { email: email.trim(), next: "/start" });
    if (sent.json.ok !== true) { setError(errorOf(sent)); setBusy(false); return; }
    rememberEmail(email);
    router.push(START.resetCode);
  }

  return <main className={frame.page}>
    <div className={`${frame.logo} ${forgotStyles.logo}`}><MaroonMark color="#fbf8f1" /></div>
    <h1 className={frame.title}>Forgot password</h1>
    <form className={frame.fields} onSubmit={(e) => { e.preventDefault(); if (ready) void sendCode(); }}>
      <label className={frame.field}><span>Email</span>
        <input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <p className={frame.error} role="alert">{error}</p>
      <button type="submit" className={`${frame.continue} ${forgotStyles.send}`} disabled={!ready}>{busy ? "Sending…" : "Send code"}</button>
    </form>
  </main>;
}
