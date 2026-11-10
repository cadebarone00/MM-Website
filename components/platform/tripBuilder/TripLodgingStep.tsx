"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateGolfTrip } from "@/lib/platform/useCreateGolfTrip";
import { readGolfTripDraft } from "@/lib/platform/golfTripDraft";
import { GolfTripInviteDialog } from "../GolfTripInviteDialog";
import { SetupStepForm } from "../SetupStepForm";
import { TripReadyScreen } from "../TripReadyScreen";
import { TripChoice } from "./TripChoice";
import styles from "../CreateTournament.module.css";

const LODGING = [{ value: "yes", label: "Yes, it's booked" }, { value: "no", label: "Not yet" }, { value: "undecided", label: "Not sure yet" }] as const;

/** Trip Builder, last step: lodging (skippable), then Create Trip → Your trip is ready → Invite your crew → the trip. */
export function TripLodgingStep() {
  const router = useRouter();
  const { state, createTrip } = useCreateGolfTrip();
  const [inviting, setInviting] = useState(false);
  const creating = state.status === "creating" || state.status === "created";
  return <>
    <SetupStepForm step="lodging" skip={{ knowsLodging: "undecided" }} nextLabel={creating ? "Creating your trip…" : "Create Trip"} onCreate={() => void createTrip()}>
      <TripChoice question="Do you know where you're staying?" name="knowsLodging" options={LODGING} required />
      {state.status === "error" && <p className={styles.reviewError} role="alert">
        {state.message}{state.needsLogin && <> <Link href="/login">Log in</Link></>}
      </p>}
    </SetupStepForm>
    {state.status === "created" && !inviting && <TripReadyScreen onInvite={() => setInviting(true)} />}
    {state.status === "created" && inviting && <GolfTripInviteDialog tripId={state.tripId} tripName={readGolfTripDraft().tripName || "Golf trip"} url={state.url} onDone={() => router.replace(state.url)} />}
  </>;
}
