import type { Metadata } from "next";
import { CodeTournamentInviteResponse } from "@/components/platform/CodeTournamentInviteResponse";
import { withReturnTo } from "@/lib/auth/returnTo";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isTournamentInviteToken, tournamentInvitePath } from "@/lib/platform/inviteImport";
import { getTournamentInvite } from "@/lib/platform/tournamentInvites";

export const metadata: Metadata = { title: "Tournament invite | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A tournament email invite: /tournaments/code/invite/<secret>. Signed out → create a profile (or log in) and come back
 * here; signed in → they join straight away (net with no handicap in the file: they enter theirs first).
 */
export default async function TournamentInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = isTournamentInviteToken(token);
  const [invite, current] = await Promise.all([valid ? getTournamentInvite(token) : null, getCurrentProfile()]);
  const back = valid ? tournamentInvitePath(token) : null;
  return <CodeTournamentInviteResponse token={valid ? token : null} invite={invite} signedIn={current.status !== "signed-out"}
    signupHref={withReturnTo("/signup", back)} loginHref={withReturnTo("/login/email", back)} />;
}
