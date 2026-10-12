"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import type { RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";
import styles from "./Settings.module.css";

const OPTIONS: { value: RoundsVisibility; label: string }[] = [{ value: "public", label: "Public" }, { value: "private", label: "Private" }];
const EXPLAIN: Record<RoundsVisibility, string> = {
  public: "Anyone can see your profile: your bio, rounds and public tournaments. Your golf trips stay private.",
  private: "Others see just your name. Your friends (anyone you've been on a golf trip with) can still see and compare your stats, and people you play with see your handicap index.",
};

/**
 * Settings → Privacy: a compact Public / Private switch for my profile and Rounds (Profile V1 rules,
 * lib/profile/profileReadModel.ts), with an (i) in the corner that explains both. Saves on tap; goes back to the old
 * choice if saving fails.
 */
export function PrivacySetting({ initial }: { initial: RoundsVisibility }) {
  const [visibility, setVisibility] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState(false);

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
    <div className={styles.cardHead}>
      <h2 id="settings-privacy" className={styles.cardTitle}>Privacy</h2>
      <button type="button" className={styles.infoButton} aria-expanded={info} aria-controls="privacy-info" aria-label={info ? "Hide what Public and Private mean" : "What do Public and Private mean?"} onClick={() => setInfo((open) => !open)}>
        {info ? <X size={16} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
      </button>
    </div>
    {info && <dl id="privacy-info" className={styles.infoPanel}>
      {OPTIONS.map((option) => <div key={option.value}><dt>{option.label}</dt><dd>{EXPLAIN[option.value]}</dd></div>)}
    </dl>}
    <div role="group" aria-label="Profile privacy" className={styles.segmented}>
      {OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={visibility === option.value} disabled={saving} onClick={() => choose(option.value)}>
        {option.label}</button>)}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </>;
}
