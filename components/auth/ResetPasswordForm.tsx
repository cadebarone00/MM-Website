"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PASSWORD_LINK_ERROR, preparePasswordSession } from "@/lib/auth/passwordSession";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "failed">("checking");
  const preparation = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    // Reuse the pending exchange when React replays effects in development.
    preparation.current ??= preparePasswordSession(window.location.href, () => {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    });
    preparation.current.then(() => {
      if (active) setSessionState("ready");
    }).catch(() => {
      if (active) {
        setSessionState("failed");
        setError(PASSWORD_LINK_ERROR);
      }
    });
    return () => { active = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sessionState !== "ready" || submitting) return;
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
    } catch {
      setError("Could not save your password. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Set a new password</h1>
      {sessionState === "checking" && <p role="status">Verifying your password link…</p>}
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <input
        required
        disabled={sessionState !== "ready"}
        minLength={6}
        autoComplete="new-password"
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        disabled={submitting || sessionState !== "ready"}
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save password"}
      </button>
      {error && <Link href="/forgot-password" className="text-sm underline">Request a new password link</Link>}
    </form>
  );
}
