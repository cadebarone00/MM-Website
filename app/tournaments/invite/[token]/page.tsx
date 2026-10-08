import type { Metadata } from "next";
import { TournamentInviteResponse } from "@/components/platform/TournamentInviteResponse";
import { withReturnTo } from "@/lib/auth/returnTo";
import { isInviteToken } from "@/lib/platform/golfTripInvitations";
import { tournamentPlayerInvitePath } from "@/lib/platform/tournamentPlayerInvitations";
import { getTournamentPlayerInvitation } from "@/lib/platform/tournamentPlayersServer";
import { getCurrentProfile } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Tournament invitation | The Maroon", robots: { index: false, follow: false } };

/**
 * A tournament player invite link: /tournaments/invite/<secret>. Anyone holding it sees a safe preview (never an
 * email). Signed out → log in / sign up and come back; signed in → Accept (your profile becomes that tournament
 * player) or Decline. Unknown, replaced or answered links show "isn't valid".
 */
export default async function TournamentInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = isInviteToken(token);
  const [invitation, current] = await Promise.all([valid ? getTournamentPlayerInvitation(token) : null, getCurrentProfile()]);
  const back = valid ? tournamentPlayerInvitePath(token) : null;
  return <TournamentInviteResponse token={valid ? token : null} invitation={invitation} viewer={current.status}
    loginHref={withReturnTo("/login/email", back)} signupHref={withReturnTo("/signup", back)} />;
}
