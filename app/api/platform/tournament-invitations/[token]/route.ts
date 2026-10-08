import { NextResponse } from "next/server";
import { isInviteToken } from "@/lib/platform/golfTripInvitations";
import { acceptTournamentPlayerInvitation, getTournamentPlayerInvitation } from "@/lib/platform/tournamentPlayersServer";

const notFound = () => NextResponse.json({ ok: false, error: "This invitation isn't valid anymore." }, { status: 404 });

/** GET: what this tournament invite link shows (tournament, player name, status) — never an email or profile id. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return notFound();
  const invitation = await getTournamentPlayerInvitation(token);
  return invitation ? NextResponse.json({ ok: true, invitation }) : notFound();
}

/** POST: the signed-in golfer claims their tournament place — their profile is attached to that player. Safe to repeat. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isInviteToken(token)) return notFound();
  try {
    const result = await acceptTournamentPlayerInvitation(token);
    if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in or sign up to accept this invitation." }, { status: 401 });
    if (result.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
    if (result.status === "claimed") return NextResponse.json({ ok: false, error: "Someone else already accepted this invitation." }, { status: 409 });
    if (result.status !== "accepted" && result.status !== "already_player") return notFound();
    return NextResponse.json({ ok: true, status: result.status, tournamentId: result.tournamentId });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ ok: false, error: "Player invitations aren't switched on yet." }, { status: 503 });
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't accept this invitation. Try again." }, { status: 500 });
  }
}
