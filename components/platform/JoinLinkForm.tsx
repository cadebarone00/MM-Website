"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { tournamentPathFromLink } from "@/lib/platform/pastTournaments";
import styles from "./JoinTournament.module.css";

/** Paste a tournament link → open that tournament's page. Does not enroll anyone. */
export function JoinLinkForm() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(event: FormEvent) {
    event.preventDefault();
    const path = tournamentPathFromLink(link, window.location.origin);
    if (!path) {
      setError("That doesn't look like a tournament link.");
      return;
    }
    setError(null);
    router.push(path);
  }

  return <form className={styles.linkForm} onSubmit={open} noValidate>
    <label htmlFor="tournament-link" className={styles.srOnly}>Tournament link</label>
    <div className={styles.linkRow}>
      <Link2 size={18} aria-hidden="true" />
      <input id="tournament-link" type="text" inputMode="url" autoComplete="off" placeholder="Paste a tournament link"
        value={link} onChange={(event) => { setLink(event.target.value); setError(null); }}
        aria-invalid={error ? true : undefined} aria-describedby={error ? "tournament-link-error" : undefined} />
      <button type="submit">Go</button>
    </div>
    {error && <p id="tournament-link-error" className={styles.error} role="alert">{error}</p>}
  </form>;
}
