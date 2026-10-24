"use client";

import { useState, type ReactNode } from "react";
import { Ticket } from "lucide-react";
import { JoinCodeEntry } from "./JoinCodeEntry";
import styles from "./JoinTournament.module.css";

/**
 * Tourneys → Get started: Create a Tournament and Join a Tournament, side by side and the same size. Join opens the
 * code box under them (a join code, or a trip's watch code). `create` is the Create link (it asks signed-out visitors to
 * sign in), built by the page.
 */
export function TourneyActions({ create }: { create: ReactNode }) {
  const [joining, setJoining] = useState(false);
  return <>
    <div className={styles.actions}>
      {create}
      <button type="button" className={styles.actionBox} aria-expanded={joining} onClick={() => setJoining(!joining)}>
        <Ticket size={22} aria-hidden="true" /><span>Join a Tournament</span>
      </button>
    </div>
    {joining && <JoinCodeEntry />}
  </>;
}
