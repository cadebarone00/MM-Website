"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      router.push("/login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Set a new password</h1>
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <input
        required
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
