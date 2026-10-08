import { NextResponse } from "next/server";
import { inviteTournamentPlayer } from "@/lib/platform/tournamentPlayersServer";

/**
 * Organizer: make an invite link for a tournament player who hasn't claimed their place yet (a new link replaces the
 * old one). Returns the secret ONCE. The database checks the caller is an owner / organizer of that player's tournament.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  try {
    const result = await inviteTournamentPlayer(playerId);
    if (result.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to manage this tournament." }, { status: 401 });
    if (result.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });
    if (result.status !== "ok") return NextResponse.json({ ok: false, error: "That player couldn't be found, has already joined, or you can't manage them." }, { status: 404 });
    return NextResponse.json({ ok: true, inviteToken: result.inviteToken }, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202" || code === "42883") return NextResponse.json({ ok: false, error: "Player invitations aren't switched on yet." }, { status: 503 });
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't make that invite. Try again." }, { status: 500 });
  }
}
