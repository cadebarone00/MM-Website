"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CodeTournamentInviteResponse } from "@/components/platform/CodeTournamentInviteResponse";
import { isTournamentInviteToken } from "@/lib/platform/inviteImport";
import type { InvitePreview } from "@/lib/platform/tournamentInvites";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → a code tournament invite link (/tournaments/code/invite/?token=…). */
function AppCodeInvite() {
  const token = useSearchParams().get("token");
  const valid = isTournamentInviteToken(token);
  const [state, reload] = useAppData<{ invite: InvitePreview | null }>(valid ? `/api/code-tournaments/invite/${encodeURIComponent(token)}` : null);
  if (valid && state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  return <CodeTournamentInviteResponse token={valid ? token : null} invite={valid && state.status === "ok" ? state.data.invite : null} signedIn signupHref="/start/sign-up/" loginHref="/start/log-in/" />;
}

export default function AppCodeInvitePage() {
  return <Suspense><AppCodeInvite /></Suspense>;
}
