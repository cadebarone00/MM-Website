"use client";

import { useSimulator } from "@/components/dev/SimulatorBridge";
import { GolfTripJoinLink } from "@/components/platform/GolfTripJoinLink";
import type { JoinPreview } from "@/lib/platform/golfTripJoinLinks";
import type { JoinPageState } from "@/lib/platform/joinPageState";

const SAMPLE: JoinPreview = { tripId: "00000000-0000-4000-8000-000000000001", tripName: "Bandon 2027", destination: "Bandon, OR",
  startDate: "2027-10-14", endDate: "2027-10-17", organizerName: "Cade", status: "open" };

/** DEV ONLY: the "Join this trip" page in each state (simulator Conditionals). Buttons don't reach the server. */
export function JoinLinkPreview() {
  const stage = useSimulator()?.state.tripBuilderStage ?? "join-signed-out";
  const state = (stage.startsWith("join-") ? stage.slice(5) : "signed-out") as JoinPageState;
  const preview = state === "invalid" ? null : { ...SAMPLE, status: state === "member" ? "member" : state === "expired" ? "expired" : "open" } as JoinPreview;
  return <GolfTripJoinLink code={null} preview={preview} state={state} signupHref="/signup" loginHref="/login/email" />;
}
