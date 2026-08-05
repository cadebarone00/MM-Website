"use client";

import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-[420px] px-4 py-16 text-center sm:px-7">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Check your email</h1>
        <p className="mt-3 font-sans text-sm text-ink-500">
          If an account exists for {email}, a reset link is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Forgot Password</h1>
      <input
        required
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
      >
        Send reset link
      </button>
    </form>
  );
}
