import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { holeEntriesFromBody } from "@/lib/platform/tripScoring";
import { saveTripHoleScores } from "@/lib/platform/tripScoringServer";

/**
 * Saved-trip scoring: save hole entries the signed-in golfer typed, for themselves (strokes + stats) or for the one
 * golfer they attest (strokes only). Who is typing comes from the session; the database refuses anything else.
 * Answers with the round's latest scoring so the sheet sees its attester's entries.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to keep score." }, { status: 401 });
  if (current.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });

  const { tripId } = await params;
  if (!isGolfTripId(tripId)) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = holeEntriesFromBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const saved = await saveTripHoleScores(current.profile.profileId, parsed.groupId, parsed.scoredProfileId, parsed.clientUpdatedAt, parsed.entries);
  if (!saved.ok) {
    if (saved.status >= 500) console.error("save_hole_scores failed:", saved.error);
    return NextResponse.json({ ok: false, error: saved.error }, { status: saved.status });
  }
  return NextResponse.json({ ok: true, scoring: saved.scoring });
}
