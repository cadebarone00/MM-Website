"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthMethods } from "./AuthMethods";
import { Eye, EyeOff } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  // Clicking the eye toggles this and it sticks (works on mobile too, where
  // there's no real hover). Hovering only kicks in on devices with a mouse.
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [passwordHovered, setPasswordHovered] = useState(false);
  const showPassword = passwordRevealed || passwordHovered;
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setUnverifiedEmail(null);
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
        setUnverifiedEmail(data.unverified ? data.email : null);
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
    if (!unverifiedEmail) return;
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: unverifiedEmail }),
    });
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="font-title text-3xl font-bold text-white">Log In</h1>
      <AuthMethods />
      {error && (
        <div role="alert" className="rounded-sm bg-red-50 px-3 py-2 font-title text-sm text-red-700">
          {error}
          {unverified && (
            <button type="button" onClick={handleResend} className="ml-2 underline underline-offset-2">
              {resent ? "Sent!" : "Resend email"}
            </button>
          )}
        </div>
      )}
      <label htmlFor="login-identity" className="-mb-3 font-title text-sm font-semibold">Username or email</label>
      <input
        id="login-identity"
        autoComplete="username"
        required
        placeholder="Username or email"
        value={usernameOrEmail}
        onChange={(e) => setUsernameOrEmail(e.target.value)}
        className="min-h-12 rounded-none border border-gold-400 bg-transparent text-white placeholder:text-white/65 px-3 py-3 font-title text-sm focus:outline-2 focus:outline-offset-2 focus:outline-gold-400"
      />
      <label htmlFor="login-password" className="-mb-3 font-title text-sm font-semibold">Password</label>
      <div className="relative">
        <input
          id="login-password"
          autoComplete="current-password"
          required
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-12 w-full rounded-none border border-gold-400 bg-transparent text-white placeholder:text-white/65 px-3 py-3 pr-10 font-title text-sm focus:outline-2 focus:outline-offset-2 focus:outline-gold-400"
        />
        <button
          type="button"
          onClick={() => setPasswordRevealed((v) => !v)}
          onMouseEnter={() => setPasswordHovered(true)}
          onMouseLeave={() => setPasswordHovered(false)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={passwordRevealed}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <Link href="/forgot-password" className="self-start font-title text-xs font-semibold uppercase tracking-widest text-white underline underline-offset-4">Forgot your password?</Link>
      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 rounded-none border border-gold-400 bg-transparent text-white px-5 py-3 text-center font-title text-sm font-semibold uppercase tracking-widest transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        {submitting ? "Logging in…" : "Next"}
      </button>
      <Link href="/signup" className="self-start font-title text-sm font-semibold uppercase tracking-widest text-white underline underline-offset-4">Don?t have an account? Sign Up</Link>
    </form>
  );
}
