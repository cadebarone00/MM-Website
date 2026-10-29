"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { errorOf, send, useRememberedEmail } from "@/lib/account/onboardingClient";
import { progressWidth, START } from "@/lib/account/onboardingRoutes";
import styles from "@/components/dev/auth/AuthCodePreview.module.css";

const CODE_LENGTH = 6; // the same as lib/auth/verifyCode.ts (server only)

/**
 * Pending accounts Phase 6: the real "Email Verification" (sign-up) and "Enter Code To Reset" (forgot password) screens —
 * the approved AuthCodePreview design connected to POST /api/auth/verify-code. The address comes from the screen before
 * (this tab's sessionStorage); without it the person is sent back to type it. After sign-up verification the current
 * Terms / Privacy versions agreed on Sign up are recorded (only when the owner has published versions).
 */
export function CodeScreen({ kind }: { kind: "signup" | "recovery" }) {
  const router = useRouter();
  const email = useRememberedEmail();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = kind === "signup" ? START.signUp : START.forgot;
  useEffect(() => { if (email === "") router.replace(back); }, [email, router, back]);
  const complete = code.length === CODE_LENGTH && !!email && !busy;

  async function verify() {
    setBusy(true);
    setError(null);
    const sent = await send("/api/auth/verify-code", { email, code, type: kind });
    if (sent.json.ok !== true) { setError(errorOf(sent)); setCode(""); setBusy(false); return; }
    if (kind === "recovery") { router.replace(START.resetPassword); return; }
    const versions = await send("/api/account/terms", undefined, "GET");
    if (typeof versions.json.terms === "string" && typeof versions.json.privacy === "string") {
      // A failure here isn't fatal: Settings asks again before Finish.
      await send("/api/account/terms", { termsVersion: versions.json.terms, privacyVersion: versions.json.privacy });
    }
    router.replace(START.confirmed);
  }

  async function resend() {
    if (!email) return;
    setError(null);
    await (kind === "signup"
      ? send("/api/auth/resend-verification", { email, next: "/onboarding" })
      : send("/api/auth/forgot-password", { email, next: "/start" }));
    setCode("");
    setResent(true);
  }

  const progress = kind === "signup";
  return <main className={styles.page}>
    <div className={`${styles.logo} ${progress ? "" : styles.noProgressLogo}`}><MaroonMark color="#fbf8f1" /></div>
    {progress && <div className={styles.progress} aria-hidden="true"><span style={{ width: progressWidth("verify") }} /></div>}
    <h1 className={styles.title}>{kind === "signup" ? "Email Verification" : "Enter Code To Reset"}</h1>
    <form onSubmit={(e) => { e.preventDefault(); if (complete) void verify(); }}>
      <label className={styles.boxes}>
        <span className={styles.srOnly}>6-digit code</span>
        <input className={styles.hiddenInput} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={CODE_LENGTH} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))} />
        {Array.from({ length: CODE_LENGTH }, (_, index) =>
          <span key={index} aria-hidden="true" className={`${styles.box} ${index === Math.min(code.length, CODE_LENGTH - 1) ? styles.current : ""}`}>{code[index] ?? ""}</span>)}
      </label>
      <p className={styles.error} role="alert">{error}</p>
      <button type="button" className={styles.resend} onClick={() => void resend()}>{resent ? "New code sent" : "Resend code"}</button>
      <button type="submit" className={styles.verify} disabled={!complete}>{busy ? "Checking…" : "Verify"}</button>
    </form>
    <footer className={styles.footer}>
      <p className={styles.help}>Experiencing issues? Email our team:<br /><a href="mailto:themaroonadmin@gmail.com">themaroonadmin@gmail.com</a></p>
    </footer>
  </main>;
}
