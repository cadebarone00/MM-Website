"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cleanInviteCode, joinPath, type InviteKind } from "@/lib/platform/codeInvites";
import { appHref } from "@/lib/app/appPaths";
import styles from "./JoinCodeCard.module.css";

const TITLE: Record<InviteKind, string> = { round: "Join a Round", trip: "Join a Trip", tourney: "Join a Tournament", league: "Join a League" };

/**
 * The same Join card on Play, Golf Trips, Tourneys and Leagues (project_specs.md, "Feature: One way to join everything"):
 * only a 6-character join code (typed in any case, with or without the dash), which opens that kind's Join page.
 */
export function JoinCodeCard({ kind }: { kind: InviteKind }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function join(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) { setError("Codes are 6 letters and numbers, like K7Q-4MZ."); return; }
    router.push(appHref(joinPath(kind, code)));
  }

  return <form className={styles.card} onSubmit={join} noValidate>
    <label htmlFor={`join-${kind}`} className={styles.title}>{TITLE[kind]}</label>
    <p className={styles.hint}>Enter the code you were sent.</p>
    <div className={styles.row}>
      <input id={`join-${kind}`} className={styles.input} placeholder="Join code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={7}
        value={code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code}
        onChange={(event) => { setCode(cleanInviteCode(event.target.value).slice(0, 6)); setError(null); }}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `join-${kind}-error` : undefined} />
      <button type="submit" className={styles.button} disabled={!code}>Join</button>
    </div>
    {error && <p id={`join-${kind}-error`} className={styles.error} role="alert">{error}</p>}
  </form>;
}
