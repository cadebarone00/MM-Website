"use client";

import { useState } from "react";
import type { RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";

const OPTIONS: { value: RoundsVisibility; label: string }[] = [{ value: "public", label: "Public" }, { value: "private", label: "Private" }];
const EXPLAIN: Record<RoundsVisibility, string> = {
  public: "Anyone signed in can see your rounds and handicap.",
  private: "Only you see your rounds. People you play with still see your handicap index.",
};

/** Settings → Privacy: Public / Private for my Rounds. Saves on tap; goes back to the old choice if saving fails. */
export function PrivacySetting({ initial }: { initial: RoundsVisibility }) {
  const [visibility, setVisibility] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: RoundsVisibility) {
    if (next === visibility || saving) return;
    const previous = visibility;
    setVisibility(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/account/privacy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility: next }) });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "We couldn't save that. Try again.");
    } catch (problem) {
      setVisibility(previous);
      setError(problem instanceof Error ? problem.message : "We couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <p className="mt-2 font-sans text-base text-ink-600">{EXPLAIN[visibility]}</p>
    <div role="group" aria-label="Rounds privacy" className="mt-4 flex gap-2">
      {OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={visibility === option.value} disabled={saving} onClick={() => choose(option.value)}
        className={`min-h-11 flex-1 rounded-pill border px-4 font-condensed text-sm font-semibold uppercase tracking-wide disabled:opacity-60 ${visibility === option.value ? "border-maroon-900 bg-maroon-900 text-cream-50" : "border-ink-200 bg-white text-ink-900 hover:border-maroon-700"}`}>
        {option.label}</button>)}
    </div>
    {error && <p role="alert" className="mt-3 font-sans text-sm text-maroon-700">{error}</p>}
  </>;
}
