import { NextResponse } from "next/server";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import { isInviteToken } from "@/lib/platform/golfTripInvitations";
import { acceptGolfTripInvitation, getGolfTripInvitation } from "@/lib/platform/golfTripsServer";

const notFound = () => NextResponse.json({ ok: false, error: "This invitation isn't valid anymore." }, { status: 404 });

/** GET: what this invite link shows (trip, invited name, status) — never the invited email. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return notFound();
  const invitation = await getGolfTripInvitation(token);
  return invitation ? NextResponse.json({ ok: true, invitation }) : notFound();
}

/** POST: the signed-in golfer accepts — their profile is attached to the invited member row. Safe to repeat. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return notFound();
  try {
    const result = await acceptGolfTripInvitation(token);
    if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in or sign up to accept this invitation." }, { status: 401 });
    if (result.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
    if (result.status === "claimed") return NextResponse.json({ ok: false, error: "Someone else already accepted this invitation." }, { status: 409 });
    if (result.status !== "accepted" && result.status !== "already_member") return notFound();
    return NextResponse.json({ ok: true, status: result.status, tripId: result.tripId, url: golfTripUrl(result.tripId) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ ok: false, error: "Trip invitations aren't switched on yet." }, { status: 503 });
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't accept this invitation. Try again." }, { status: 500 });
  }
}
