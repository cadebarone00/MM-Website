"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TournamentInviteResponse } from "@/components/platform/TournamentInviteResponse";
import { isInviteToken } from "@/lib/platform/golfTripInvitations";
import type { EditProfileData } from "@/lib/profile/profileScreensData";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → a tournament player invitation (/tournaments/invite/?token=…). An unfinished profile finishes setup before competing. */
function AppTournamentInvite() {
  const token = useSearchParams().get("token");
  const valid = isInviteToken(token);
  const [invite, reloadInvite] = useAppData<{ invitation: Parameters<typeof TournamentInviteResponse>[0]["invitation"] }>(valid ? `/api/platform/tournament-invitations/${encodeURIComponent(token)}` : null);
  const [me, reloadMe] = useAppData<EditProfileData>("/api/app/profile?view=edit");
  if (me.status !== "ok") return <AppStatus state={me} onRetry={reloadMe} />;
  if (valid && invite.status === "loading") return <AppStatus state={invite} onRetry={reloadInvite} />;
  return <TournamentInviteResponse token={valid ? token : null} invitation={valid && invite.status === "ok" ? invite.data.invitation : null}
    viewer={me.data.status === "ok" ? "ok" : "no-profile"} loginHref="/start/log-in/" signupHref="/start/sign-up/" />;
}

export default function AppTournamentInvitePage() {
  return <Suspense><AppTournamentInvite /></Suspense>;
}
