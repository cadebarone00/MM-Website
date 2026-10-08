import type { Metadata } from "next";
import { GolfTripInviteResponse } from "@/components/platform/GolfTripInviteResponse";
import { withReturnTo } from "@/lib/auth/returnTo";
import { golfTripInvitePath, isInviteToken } from "@/lib/platform/golfTripInvitations";
import { getGolfTripInvitation } from "@/lib/platform/golfTripsServer";
import { getCurrentProfile } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Trip invitation | The Maroon", robots: { index: false, follow: false } };

/**
 * A Golf Trip invite link: /golf-trips/invite/<secret>. Anyone holding the link sees a safe preview (never the
 * invited email). Signed out → log in / sign up and come back here; signed in → Accept or Decline. An unknown,
 * cancelled, replaced or answered link shows "isn't valid".
 */
export default async function GolfTripInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = isInviteToken(token);
  const [invitation, current] = await Promise.all([valid ? getGolfTripInvitation(token) : null, getCurrentProfile()]);
  const back = valid ? golfTripInvitePath(token) : null;
  return <GolfTripInviteResponse token={valid ? token : null} invitation={invitation} viewer={current.status}
    loginHref={withReturnTo("/login/email", back)} signupHref={withReturnTo("/signup", back)} />;
}
