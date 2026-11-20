"use client";

import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { JoinCodeCard } from "./JoinCodeCard";
import { SignInRequiredLink } from "./SignInRequiredLink";
import styles from "@/app/golf-trips/page.module.css";

/**
 * Golf Trips top buttons (owner request 2026-11-19): two half-width buttons in the itinerary "+ Add" style.
 * Create → the Create a Golf Trip flow (sign-in prompt if signed out). Join → a pop-up with the Join code box.
 */
export function GolfTripsActions() {
  const [joining, setJoining] = useState(false);

  return <div className={styles.actions}>
    <SignInRequiredLink href="/tournaments/create/golf-trip" className={styles.actionButton} message="Sign in to create a golf trip">
      <Plus size={18} strokeWidth={2.5} aria-hidden="true" />Create
    </SignInRequiredLink>
    <button type="button" className={styles.actionButton} aria-haspopup="dialog" onClick={() => setJoining(true)}>
      <Link2 size={18} strokeWidth={2.5} aria-hidden="true" />Join
    </button>
    {joining && <GolfTripActionSheet label="Join a Trip" onClose={() => setJoining(false)} className={styles.joinSheet}>
      <JoinCodeCard kind="trip" />
    </GolfTripActionSheet>}
  </div>;
}
