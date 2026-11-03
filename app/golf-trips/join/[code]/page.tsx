import type { Metadata } from "next";
import { GolfTripJoinLink } from "@/components/platform/GolfTripJoinLink";
import { withReturnTo } from "@/lib/auth/returnTo";
import { golfTripJoinPath, isJoinCode } from "@/lib/platform/golfTripJoinLinks";
import { getGolfTripJoinPreview } from "@/lib/platform/golfTripsServer";
import { joinPageState } from "@/lib/platform/joinPageState";
import { getCurrentProfile } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Join this trip | The Maroon", robots: { index: false, follow: false } };

/**
 * Trip Builder's shareable trip link: /golf-trips/join/<code> (lasts 30 minutes). Shows the trip; signed out → sign up
 * (or log in) and come back here; signed in → Join trip, added straight away. Expired / unknown links say so.
 */
export default async function GolfTripJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const valid = isJoinCode(code);
  const [preview, current] = await Promise.all([valid ? getGolfTripJoinPreview(code) : null, getCurrentProfile()]);
  const back = golfTripJoinPath(valid ? code : "");
  return <GolfTripJoinLink code={valid ? code : null} preview={preview} state={joinPageState(preview, current.status !== "signed-out")}
    signupHref={withReturnTo("/signup", back)} loginHref={withReturnTo("/login/email", back)} />;
}
