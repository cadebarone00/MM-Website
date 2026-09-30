"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthMethods } from "./AuthMethods";

export function SignUpForm({ initialCode }: { initialCode?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(initialCode ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  const isInvite = Boolean(initialCode);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === 1) { setStep(2); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, username, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="w-full">
        <h1 className="font-title text-3xl font-bold text-white">Check your email</h1>
        <p className="mt-3 font-sans text-sm text-white/75">
          We sent a verification link to {email}. Click it, then{" "}
          <Link href="/login" className="text-white underline underline-offset-2">
            log in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="font-title text-3xl font-bold text-white">Create Account</h1>
      <p className="text-sm">{step === 1 ? "Start with your email and password." : "A few details to finish your account."}</p>
      {step === 1 && <AuthMethods />}
      {isInvite && (
        <p className="rounded-sm bg-cream-50 px-3 py-2 font-sans text-sm text-ink-700">
          Signing up as <span className="font-semibold">{initialCode}</span>
        </p>
      )}
      {error && <p role="alert" className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      {step === 1 ? <>
        <label className="flex flex-col gap-2">Email
          <input autoComplete="email" required type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2">Password
          <input autoComplete="new-password" required minLength={6} type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <span className="text-xs">At least 6 characters</span>
        </label>
      </> : <>
        <label className="flex flex-col gap-2">Name
          <input autoComplete="name" required value={name} onChange={e => setName(e.target.value)} />
        </label>
        {!isInvite && <label className="flex flex-col gap-2">Username
          <input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} />
        </label>}
      </>}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 bg-white text-maroon-900 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-widest transition-colors hover:bg-cream-100 disabled:opacity-50"
      >
        {submitting ? "Creating account…" : step === 1 ? "Next" : "Create Account"}
      </button>
      {step === 2 && <button type="button" onClick={() => { setStep(1); setError(null); }} disabled={submitting}>Back to email and password</button>}
      <p className="text-center font-sans text-sm text-white/75">
        Already have an account?{" "}
        <Link href="/login" className="text-white underline underline-offset-2">
          Log In
        </Link>
      </p>
    </form>
  );
}
