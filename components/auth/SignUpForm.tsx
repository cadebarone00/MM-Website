"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthMethods } from "./AuthMethods";
import styles from "./SignUpForm.module.css";

export function SignUpForm({ initialCode }: { initialCode?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (step === 1) { setStep(2); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, ...(initialCode ? { username: initialCode } : {}) }) });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? "Could not create account."); return; }
      setDone(true);
    } catch { setError("Something went wrong. Try again."); }
    finally { setSubmitting(false); }
  }
  return <main className={styles.page}>
    <h1 className={styles.title}>THE MAROON</h1>
    <section className={styles.panel} aria-label="Create an account">
      {done ? <div role="status"><h2>Check your email</h2><p>Open the verification link sent to {email}, then <Link href="/login">sign in</Link>.</p></div> :
      <form onSubmit={handleSubmit}>
        {step === 1 ? <><AuthMethods /><label>Email<input autoComplete="email" required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label></> :
          <><h2>Create a password</h2><p>{email}</p><label>Password<input autoComplete="new-password" required minLength={6} type="password" value={password} onChange={e => setPassword(e.target.value)} /><span>At least 6 characters</span></label></>}
        {initialCode && <p>Signing up as {initialCode}</p>}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Creating account?" : step === 1 ? "Next" : "Create an Account"}</button>
        {step === 2 && <button type="button" disabled={submitting} onClick={() => { setStep(1); setError(null); }}>Back</button>}
        <Link href="/login">Sign in</Link>
      </form>}
    </section>
  </main>;
}
