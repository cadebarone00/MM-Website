import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { tripGameActionFromBody } from "@/lib/platform/tripGamesRows";
import { getTripGames, tripGameAction } from "@/lib/platform/tripGamesServer";

/**
 * Golf trip → Games: the signed-in player's games on this trip (GET), and creating, starting, picking and removing
 * them (POST). Who is acting comes from the session; the database decides what they may do.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Log in to see games." }, { status: 401 });
  const { tripId } = await params;
  if (!isGolfTripId(tripId)) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });
  const result = await getTripGames(current.profile.profileId, tripId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, games: result.games }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to play games." }, { status: 401 });
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
  const { tripId } = await params;
  if (!isGolfTripId(tripId)) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  const parsed = tripGameActionFromBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const result = await tripGameAction(current.profile.profileId, tripId, parsed.value);
  if (!result.ok) {
    if (result.status >= 500) console.error("trip games action failed:", result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, games: result.games });
}
