import { NextResponse } from "next/server";
import { regenerateGolfTripInvite } from "@/lib/platform/golfTripsServer";

/** Organizer gets a new invite link for someone who hasn't accepted (lost link, or re-inviting after a decline).
 *  The old link stops working at once; the secret is returned only here. */
export async function POST(_request: Request, { params }: { params: Promise<{ tripId: string; memberId: string }> }) {
  const { tripId, memberId } = await params;
  try {
    const result = await regenerateGolfTripInvite(tripId, memberId);
    if (result === "signed-out") return NextResponse.json({ ok: false, error: "Log in to manage this trip." }, { status: 401 });
    if (!result) return NextResponse.json({ ok: false, error: "No invitation to renew here — they may have already joined." }, { status: 404 });
    return NextResponse.json({ ok: true, inviteToken: result.inviteToken });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ ok: false, error: "Trip invitations aren't switched on yet." }, { status: 503 });
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't make a new link. Try again." }, { status: 500 });
  }
}
