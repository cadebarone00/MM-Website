import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { submitTripScorecard } from "@/lib/platform/tripScoringServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Submit & Save (Player & Attest Step 5): the signed-in golfer submits their own card. The database decides from saved
 * scores only (complete, matches the attester, the version the phone verified) and locks the card. Asking twice
 * returns the first submission. A phone that queued this as another account is refused.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to submit your card." }, { status: 401 });
  if (current.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
  const { tripId } = await params;
  if (!isGolfTripId(tripId)) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { groupId, golferProfileId, expectedProfileId, cardVersion } = body ?? {};
  if (typeof groupId !== "string" || !UUID.test(groupId) || typeof golferProfileId !== "string" || !UUID.test(golferProfileId)
      || typeof cardVersion !== "number" || !Number.isInteger(cardVersion) || cardVersion < 0) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (expectedProfileId !== current.profile.profileId) {
    return NextResponse.json({ ok: false, reason: "wrong-account", error: "This card was opened under a different account." }, { status: 409 });
  }

  const submitted = await submitTripScorecard(current.profile.profileId, groupId, golferProfileId, cardVersion);
  if (!submitted.ok) {
    if (submitted.status >= 500) console.error("submit_trip_scorecard failed:", submitted.error);
    return NextResponse.json({ ok: false, error: submitted.error }, { status: submitted.status });
  }
  return NextResponse.json({ ok: true, ...submitted.result });
}
