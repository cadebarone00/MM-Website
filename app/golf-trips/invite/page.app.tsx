"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GolfTripInviteResponse } from "@/components/platform/GolfTripInviteResponse";
import { isInviteToken, type InvitationPreview } from "@/lib/platform/golfTripInvitations";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → a trip invitation (/golf-trips/invite/?token=…): the website's accept / decline screen. */
function AppTripInvite() {
  const token = useSearchParams().get("token");
  const valid = isInviteToken(token);
  const [state, reload] = useAppData<{ invitation: InvitationPreview }>(valid ? `/api/golf-trips/invitations/${encodeURIComponent(token)}` : null);
  if (valid && state.status === "loading") return <AppStatus state={state} onRetry={reload} />;
  const invitation = valid && state.status === "ok" ? state.data.invitation : null;
  return <GolfTripInviteResponse token={valid ? token : null} invitation={invitation} viewer="ok" loginHref="/start/log-in/" signupHref="/start/sign-up/" />;
}

export default function AppTripInvitePage() {
  return <Suspense><AppTripInvite /></Suspense>;
}
