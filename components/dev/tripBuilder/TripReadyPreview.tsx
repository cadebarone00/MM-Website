"use client";

import { useState } from "react";
import { GolfTripInviteDialog } from "@/components/platform/GolfTripInviteDialog";
import { TripReadyScreen } from "@/components/platform/TripReadyScreen";

/** DEV ONLY: Trip Builder's finish — Your trip is ready → Invite your crew pop-up. Nothing is created. */
export function TripReadyPreview() {
  const [inviting, setInviting] = useState(false);
  const [key, setKey] = useState(0);
  if (inviting) return <GolfTripInviteDialog tripId="00000000-0000-4000-8000-000000000001" tripName="Bandon 2027" url="/dev/tournament"
    onDone={() => { setInviting(false); setKey(k => k + 1); }} />;
  return <TripReadyScreen key={key} onInvite={() => setInviting(true)} />;
}
