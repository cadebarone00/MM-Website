import { NextResponse } from "next/server";
import { isInviteToken } from "@/lib/platform/golfTripInvitations";
import { declineTournamentPlayerInvitation } from "@/lib/platform/tournamentPlayersServer";

/** The signed-in person says no to a tournament invitation. The organizer sees "Declined"; the link stops working. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return NextResponse.json({ ok: false, error: "This invitation isn't valid anymore." }, { status: 404 });
  try {
    const result = await declineTournamentPlayerInvitation(token);
    if (result === "signed-out") return NextResponse.json({ ok: false, error: "Log in to answer this invitation." }, { status: 401 });
    if (result === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
    if (result === "already_player") return NextResponse.json({ ok: false, error: "This is already your place in the tournament." }, { status: 409 });
    if (result === "not_found") return NextResponse.json({ ok: false, error: "This invitation isn't valid anymore." }, { status: 404 });
    return NextResponse.json({ ok: true, status: "declined" });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ ok: false, error: "Player invitations aren't switched on yet." }, { status: 503 });
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't save your answer. Try again." }, { status: 500 });
  }
}
