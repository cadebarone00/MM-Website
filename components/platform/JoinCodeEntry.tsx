"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cleanCode } from "@/lib/platform/codeTournaments";
import styles from "./JoinTournament.module.css";

/** Tourneys → Join or watch: a join code (any case, with or without the dash) opens the join screen; a watch code (starts with W) opens the read-only view. */
export function JoinCodeEntry() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const code = cleanCode(text);

  function go(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) { setError("Codes are 6 letters and numbers, like K7Q-4MZ."); return; }
    router.push(code.startsWith("W") ? `/watch/${code}` : `/tournaments/code/join?code=${code}`);
  }

  return <form className={styles.joinEntry} onSubmit={go} noValidate>
    <h3 className={styles.descriptor}>Join or watch</h3>
    <label htmlFor="join-code" className={styles.srOnly}>Tournament code</label>
    <div className={styles.codeRow}>
      <input id="join-code" className={styles.joinInput} type="text" placeholder="Join or watch code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
        value={code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code} maxLength={7}
        onChange={(event) => { setText(cleanCode(event.target.value).slice(0, 6)); setError(null); }}
        aria-invalid={error ? true : undefined} aria-describedby={error ? "join-code-error" : undefined} />
      <button type="submit" className={styles.codeGo} disabled={!code}>Join</button>
    </div>
    {error && <p id="join-code-error" className={styles.error} role="alert">{error}</p>}
  </form>;
}
