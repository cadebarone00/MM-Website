import { NextResponse } from "next/server";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import { inviteInputFromBody } from "@/lib/platform/golfTripInvitations";
import { inviteGolfTripMember } from "@/lib/platform/golfTripsServer";

/**
 * Organizer invites someone to the trip: POST { displayName, email? }. Creates that person's member row now (no
 * profile until they accept) and returns the invite secret ONCE, for the link the organizer shares. The email is
 * contact info only — the reply is the same whether or not it belongs to a Maroon account.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const parsed = inviteInputFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { tripId } = await params;
  try {
    const result = await inviteGolfTripMember(tripId, parsed.input);
    if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to invite people." }, { status: 401 });
    if (result.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
    if (result.status !== "ok") return NextResponse.json({ ok: false, error: "This trip couldn't be found, or you're not its organizer." }, { status: 404 });
    return NextResponse.json({ ok: true, memberId: result.memberId, inviteToken: result.inviteToken, tripUrl: golfTripUrl(tripId) }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ ok: false, error: "Trip invitations aren't switched on yet." }, { status: 503 });
    if (code === "23505") return NextResponse.json({ ok: false, error: "That email is already invited to this trip." }, { status: 409 });
    if (code === "22023") return NextResponse.json({ ok: false, error: "Check the name and email." }, { status: 400 });
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't send that invite. Try again." }, { status: 500 });
  }
}
