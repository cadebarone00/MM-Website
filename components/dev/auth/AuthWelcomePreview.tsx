"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import styles from "./AuthWelcomePreview.module.css";

/** DEV ONLY: Authentication screen 1 (Welcome): the fork. Two buttons, Sign up or Log in, each to its own page, so the
 * app never has to look up whether an email already has an account. */
export function AuthWelcomePreview() {
  return <main className={`${styles.page} ${styles.fork}`}>
    <div className={styles.forkLogo}><MaroonMark color="#fbf8f1" /></div>
    <div className={styles.forkButtons}>
      <Link className={styles.primary} href="/dev/auth/sign-up">Sign up</Link>
      <Link className={styles.secondary} href="/dev/auth/sign-in">Log in</Link>
    </div>
  </main>;
}

/** DEV ONLY: Sign up: email → the code screen, or Google / Apple (which also log existing accounts in). */
export function AuthSignUpPreview() {
  return <main className={styles.page}>
    <div className={styles.logo}><MaroonMark color="#fbf8f1" /></div>
    <h1 className={styles.title}>Sign up</h1>
    <form className={styles.form} action="/dev/auth/verification-code">
      <input className={styles.input} type="email" name="email" placeholder="Email" autoComplete="email" aria-label="Email" />
      <button className={styles.primary} type="submit">Continue</button>
    </form>
    <p className={styles.or}>or</p>
    <div className={styles.form}>
      <Link className={styles.provider} href="/dev/auth/google"><GoogleIcon />Continue with Google</Link>
      <Link className={styles.provider} href="/dev/auth/apple"><AppleIcon />Continue with Apple</Link>
    </div>
  </main>;
}

/** DEV ONLY: Log in: email + password, and the way to Forgot password. Nothing is checked yet. */
export function AuthLogInPreview() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && password !== "";

  return <main className={styles.page}>
    <div className={styles.logo}><MaroonMark color="#fbf8f1" /></div>
    <h1 className={styles.title}>Log in</h1>
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (ready) router.push("/"); }}>
      <input className={styles.input} type="email" placeholder="Email" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-label="Email"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className={styles.passwordBox}>
        <input className={styles.input} type={shown ? "text" : "password"} placeholder="Password" autoComplete="current-password" aria-label="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className={styles.eye} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={() => setShown(!shown)}>
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      <button className={styles.primary} type="submit" disabled={!ready}>Log in</button>
    </form>
    <Link className={styles.forgot} href="/dev/auth/forgot-password">Forgot password?</Link>
  </main>;
}

export function GoogleIcon() {
  return <svg className={styles.icon} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>;
}

export function AppleIcon() {
  return <svg className={styles.icon} viewBox="0 0 384 512" aria-hidden="true">
    <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>;
}

export function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>;
}

export function EyeOffIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
