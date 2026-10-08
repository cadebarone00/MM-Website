import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { holeEntriesFromBody, holeOpsFromBody } from "@/lib/platform/tripScoring";
import { getTripRoundScoring, saveTripHoleOps, saveTripHoleScores } from "@/lib/platform/tripScoringServer";

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
  // Queued ops (offline scoring): applied once each, or answered "conflict"; never replayed under another account.
  if (body && typeof body === "object" && "ops" in body) {
    const ops = holeOpsFromBody(body);
    if (!ops.ok) return NextResponse.json({ ok: false, error: ops.error }, { status: 400 });
    if (ops.expectedProfileId !== current.profile.profileId) {
      return NextResponse.json({ ok: false, reason: "wrong-account", error: "These scores were entered under a different account." }, { status: 409 });
    }
    const saved = await saveTripHoleOps(current.profile.profileId, ops.groupId, ops.scoredProfileId, ops.ops);
    if (!saved.ok) {
      if (saved.status >= 500) console.error("save_hole_score_ops failed:", saved.error);
      return NextResponse.json({ ok: false, error: saved.error, ...("reason" in saved && saved.reason ? { reason: saved.reason } : {}) }, { status: saved.status });
    }
    return NextResponse.json({ ok: true, results: saved.results, scoring: saved.scoring });
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

/** Live sync: the round's latest groups and entries (?round=<number>), for members of the trip only. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Log in to keep score." }, { status: 401 });
  const { tripId } = await params;
  const round = Number(new URL(request.url).searchParams.get("round"));
  if (!isGolfTripId(tripId) || !Number.isInteger(round) || round < 1 || round > 62) return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
  const scoring = await getTripRoundScoring(current.profile.profileId, tripId, round);
  if (scoring === "failed") return NextResponse.json({ ok: false, error: "Couldn't load scores." }, { status: 500 });
  if (!scoring) return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
  return NextResponse.json({ ok: true, scoring }, { headers: { "Cache-Control": "no-store" } });
}
