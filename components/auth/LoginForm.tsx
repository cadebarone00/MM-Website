"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameOrEmail, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        setUnverified(Boolean(data.unverified));
        return;
      }
      window.dispatchEvent(new CustomEvent("mm:session-changed"));
      router.push("/account/choose");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!usernameOrEmail.includes("@")) return;
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: usernameOrEmail }),
    });
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Login</h1>
      {error && (
        <div className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">
          {error}
          {unverified && (
            <button type="button" onClick={handleResend} className="ml-2 underline underline-offset-2">
              {resent ? "Sent!" : "Resend email"}
            </button>
          )}
        </div>
      )}
      <input
        required
        placeholder="Username or email"
        value={usernameOrEmail}
        onChange={(e) => setUsernameOrEmail(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <input
        required
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 disabled:opacity-50"
      >
        {submitting ? "Logging in…" : "Login"}
      </button>
      <div className="flex justify-between font-sans text-sm text-ink-500">
        <Link href="/signup" className="text-maroon-700 underline underline-offset-2">
          Sign up instead
        </Link>
        <Link href="/forgot-password" className="text-maroon-700 underline underline-offset-2">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
