import { NextResponse } from "next/server";
import { getCurrentProfileForRequest } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { checkTripScoringWriteScope, submitTripScorecard } from "@/lib/platform/tripScoringServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Submit & Save (Player & Attest Step 5): the signed-in golfer submits their own card. The database decides from saved
 * scores only (complete, matches the attester, the version the phone verified) and locks the card. Asking twice
 * returns the first submission. A phone that queued this as another account is refused.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const current = await getCurrentProfileForRequest(request);
    if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to submit your card." }, { status: 401 });
    if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
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

    if (golferProfileId.toLowerCase() !== current.profile.profileId.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "You can only submit your own card." }, { status: 403 });
    }
    const scope = await checkTripScoringWriteScope(request, tripId, groupId);
    if (scope === "failed") return NextResponse.json({ ok: false, error: "Couldn't submit the card. Try again." }, { status: 500 });
    if (scope !== "ok") return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
    // Trip visibility alone does not prove the golfer has a card in this group.
    const player = await (await createSupabaseServerClient(request)).from("scoring_group_players").select("profile_id")
      .eq("group_id", groupId).eq("profile_id", current.profile.profileId).maybeSingle();
    if (player.error) return NextResponse.json({ ok: false, error: "Couldn't submit the card. Try again." }, { status: 500 });
    if (!player.data) return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
    if (player.data.profile_id !== current.profile.profileId) return NextResponse.json({ ok: false, error: "Couldn't submit the card. Try again." }, { status: 500 });
    const submitted = await submitTripScorecard(current.profile.profileId, groupId, golferProfileId, cardVersion);
    if (!submitted.ok) {
      if (submitted.status >= 500) console.error("submit_trip_scorecard failed:", submitted.error);
      return NextResponse.json({ ok: false, error: submitted.error }, { status: submitted.status });
    }
    return NextResponse.json({ ok: true, ...submitted.result });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't submit the card. Try again." }, { status: 500 });
  }
}
