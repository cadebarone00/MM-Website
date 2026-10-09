import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { correctionDecisionFromBody, correctionRequestFromBody } from "@/lib/platform/tripCorrections";
import { decideScorecardCorrection, getScorecardCorrections, requestScorecardCorrection } from "@/lib/platform/tripScoringServer";

/**
 * Scorecard corrections (Player & Attest Step 6). GET ?round=<n>: requests + submission history for the round.
 * POST {action: "request"}: the golfer asks to correct their own submitted card. POST {action: "decide"}: the trip
 * organizer approves or denies. Who is acting comes from the session; the database enforces every rule.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Log in to see corrections." }, { status: 401 });
  const { tripId } = await params;
  const round = Number(new URL(request.url).searchParams.get("round"));
  if (!isGolfTripId(tripId) || !Number.isInteger(round) || round < 1 || round > 62) return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
  const corrections = await getScorecardCorrections(current.profile.profileId, tripId, round);
  if (!corrections) return NextResponse.json({ ok: false, error: "Corrections aren't available." }, { status: 404 });
  return NextResponse.json({ ok: true, corrections }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (current.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
  const { tripId } = await params;
  if (!isGolfTripId(tripId)) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }

  const me = current.profile.profileId;
  if (body?.expectedProfileId !== me) return NextResponse.json({ ok: false, reason: "wrong-account", error: "This was opened under a different account." }, { status: 409 });
  if (body?.action === "request") {
    const input = correctionRequestFromBody(body);
    if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
    const result = await requestScorecardCorrection(me, input.groupId, input.golferProfileId, input.holes, input.reason);
    return result.ok ? NextResponse.json({ ok: true, status: result.status }) : NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  if (body?.action === "decide") {
    const input = correctionDecisionFromBody(body);
    if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
    const result = await decideScorecardCorrection(me, input.requestId, input.approve, input.note);
    return result.ok ? NextResponse.json({ ok: true, status: result.status }) : NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
}
