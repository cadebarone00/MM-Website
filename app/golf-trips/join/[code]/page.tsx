import type { Metadata } from "next";
import { GolfTripJoinLink } from "@/components/platform/GolfTripJoinLink";
import { withReturnTo } from "@/lib/auth/returnTo";
import { golfTripJoinPath, tripJoinValue } from "@/lib/platform/golfTripJoinLinks";
import { getGolfTripJoinPreview } from "@/lib/platform/golfTripsServer";
import { joinPageState } from "@/lib/platform/joinPageState";
import { getCurrentProfile } from "@/lib/profile/currentProfile";

export const metadata: Metadata = { title: "Join this trip | The Maroon", robots: { index: false, follow: false } };

/**
 * Trip Builder's shareable trip link: /golf-trips/join/<code> (lasts 30 minutes), or the trip's 6-character invite code
 * (supabase/join_codes.sql; doesn't expire). Shows the trip; signed out → sign up
 * (or log in) and come back here; signed in → Join trip, added straight away. Expired / unknown links say so.
 */
export default async function GolfTripJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = tripJoinValue((await params).code);
  const [preview, current] = await Promise.all([code ? getGolfTripJoinPreview(code) : null, getCurrentProfile()]);
  const back = golfTripJoinPath(code ?? "");
  return <GolfTripJoinLink code={code} preview={preview} state={joinPageState(preview, current.status !== "signed-out")}
    signupHref={withReturnTo("/signup", back)} loginHref={withReturnTo("/login/email", back)} />;
}
