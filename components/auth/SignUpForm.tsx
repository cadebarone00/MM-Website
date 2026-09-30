"use client";

import { useState } from "react";
import Link from "next/link";

export function SignUpForm({ initialCode }: { initialCode?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(initialCode ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isInvite = Boolean(initialCode);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
        <h1 className="font-title text-3xl font-bold text-ink-900">Check your email</h1>
        <p className="mt-3 font-sans text-sm text-ink-500">
          We sent a verification link to {email}. Click it, then{" "}
          <Link href="/login" className="text-maroon-700 underline underline-offset-2">
            log in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
      <h1 className="font-title text-3xl font-bold text-ink-900">Sign Up</h1>
      {isInvite && (
        <p className="rounded-sm bg-cream-50 px-3 py-2 font-sans text-sm text-ink-700">
          Signing up as <span className="font-semibold">{initialCode}</span>
        </p>
      )}
      {error && <p role="alert" className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <label className="flex flex-col gap-2 font-title text-sm font-semibold">Name
<input autoComplete="name"
        required
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-h-12 rounded-none border border-ink-300 bg-white px-3 py-3 font-sans text-sm focus:outline-2 focus:outline-offset-2 focus:outline-maroon-700"
      />
</label>
      <label className="flex flex-col gap-2 font-title text-sm font-semibold">Email
<input autoComplete="email"
        required
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-h-12 rounded-none border border-ink-300 bg-white px-3 py-3 font-sans text-sm focus:outline-2 focus:outline-offset-2 focus:outline-maroon-700"
      />
</label>
      {!isInvite && (
        <label className="flex flex-col gap-2 font-title text-sm font-semibold">Username
<input autoComplete="username"
          required
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="min-h-12 rounded-none border border-ink-300 bg-white px-3 py-3 font-sans text-sm focus:outline-2 focus:outline-offset-2 focus:outline-maroon-700"
        />
</label>
      )}
      <label className="flex flex-col gap-2 font-title text-sm font-semibold">Password
<input autoComplete="new-password"
        required
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="min-h-12 rounded-none border border-ink-300 bg-white px-3 py-3 font-sans text-sm focus:outline-2 focus:outline-offset-2 focus:outline-maroon-700"
      />
</label>
      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 bg-maroon-900 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-maroon-700 disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Sign Up"}
      </button>
      <p className="text-center font-sans text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="text-maroon-700 underline underline-offset-2">
          Sign In
        </Link>
      </p>
    </form>
  );
}
