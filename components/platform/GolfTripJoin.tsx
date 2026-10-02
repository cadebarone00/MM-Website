"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { golfTripUrl, tripIdFromJoinInput } from "@/lib/platform/golfTripCreate";
import styles from "@/app/golf-trips/page.module.css";

/**
 * Golf Trips, Join a Trip: paste the Trip ID or trip link someone sent you. For now it only opens that
 * trip's page; nothing adds you as a member yet (same as the Players step's Invite).
 */
export function GolfTripJoin() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tripId = tripIdFromJoinInput(value);
    if (!tripId) {
      setError("Enter a Trip ID or the trip link you were sent.");
      return;
    }
    setError(null);
    router.push(golfTripUrl(tripId));
  }

  return (
    <form className={styles.join} onSubmit={join} noValidate>
      <label htmlFor="join-trip" className={styles.joinLabel}>Join a Trip</label>
      <p className={styles.joinHint}>Paste the Trip ID or link you were sent.</p>
      <div className={styles.joinRow}>
        <input
          id="join-trip"
          className={styles.joinInput}
          value={value}
          onChange={(event) => { setValue(event.target.value); setError(null); }}
          placeholder="Trip ID or link"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "join-trip-error" : undefined}
        />
        <button type="submit" className={styles.joinButton}>Join</button>
      </div>
      {error && <p id="join-trip-error" role="alert" className={styles.joinError}>{error}</p>}
    </form>
  );
}
