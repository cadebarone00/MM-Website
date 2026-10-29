"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { EyeIcon, EyeOffIcon } from "@/components/dev/auth/AuthWelcomePreview";
import { errorOf, rememberEmail, send } from "@/lib/account/onboardingClient";
import { START, STATUS, stepPath } from "@/lib/account/onboardingRoutes";
import type { OnboardingStep } from "@/lib/account/onboardingApi";
import styles from "@/components/dev/auth/AuthWelcomePreview.module.css";

/**
 * Pending accounts Phase 6: the real Welcome, Sign up and Log in screens — the approved /dev/auth designs
 * (components/dev/auth/AuthWelcomePreview.tsx, same styles) connected to the real APIs. Google / Apple buttons stay
 * hidden here until Phase 7 connects them to onboarding.
 */
const EMAIL = /^\S+@\S+\.\S+$/;

export function WelcomeScreen() {
  return <main className={`${styles.page} ${styles.fork}`}>
    <div className={styles.forkLogo}><MaroonMark color="#fbf8f1" /></div>
    <div className={styles.forkButtons}>
      <Link className={styles.primary} href={START.signUp}>Sign up</Link>
      <Link className={styles.secondary} href={START.logIn}>Log in</Link>
    </div>
  </main>;
}

/** Email → Create password (the account is made there, with the password: decision D1). */
export function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const ready = EMAIL.test(email.trim());
  return <main className={styles.page}>
    <div className={styles.logo}><MaroonMark color="#fbf8f1" /></div>
    <h1 className={styles.title}>Sign up</h1>
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (!ready) return; rememberEmail(email); router.push(START.password); }}>
      <input className={styles.input} type="email" name="email" placeholder="Email" autoComplete="email" autoCapitalize="none" spellCheck={false}
        aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className={styles.primary} type="submit" disabled={!ready}>Continue</button>
      <p className={styles.terms}>By continuing, you agree to The Maroon&apos;s Terms of Service and Privacy Policy.</p>
    </form>
  </main>;
}

/** Email + password. Active → Play; Pending → the first unfinished step; blocked → the account status page. */
export function LogInScreen({ notice }: { notice: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = EMAIL.test(email.trim()) && password !== "" && !busy;

  async function logIn() {
    setBusy(true);
    setError(null);
    const sent = await send("/api/auth/login", { usernameOrEmail: email.trim(), password });
    if (sent.json.unverified) {
      // Not verified yet: send a fresh code and go to the code screen.
      rememberEmail(email);
      await send("/api/auth/resend-verification", { email: email.trim(), next: "/onboarding" });
      router.push(START.verify);
      return;
    }
    if (sent.json.ok !== true) { setError(errorOf(sent)); setBusy(false); return; }
    const resume = await send("/api/account/onboarding", undefined, "GET");
    const next = resume.json.next as OnboardingStep | null | undefined;
    router.replace(next ? stepPath(next) : STATUS);
    router.refresh();
  }

  return <main className={styles.page}>
    <div className={styles.logo}><MaroonMark color="#fbf8f1" /></div>
    <h1 className={styles.title}>Log in</h1>
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (ready) void logIn(); }}>
      <input className={styles.input} type="email" placeholder="Email" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-label="Email"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <LogInPassword value={password} onChange={setPassword} />
      {/* Always rendered so the button never moves when a message appears. */}
      {error ? <p className={styles.error} role="alert">{error}</p> : <p className={styles.notice} role="status">{notice}</p>}
      <button className={styles.primary} type="submit" disabled={!ready}>{busy ? "Logging in…" : "Log in"}</button>
    </form>
    <Link className={styles.forgot} href={START.forgot}>Forgot password?</Link>
  </main>;
}

/** The Log in design's own password box (placeholder + eye inside the field), not the labelled PasswordField. */
function LogInPassword({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useState(false);
  return <div className={styles.passwordBox}>
    <input className={styles.input} type={shown ? "text" : "password"} placeholder="Password" autoComplete="current-password" aria-label="Password"
      value={value} onChange={(e) => onChange(e.target.value)} />
    <button type="button" className={styles.eye} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={() => setShown(!shown)}>
      {shown ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  </div>;
}
