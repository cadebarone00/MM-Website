import { NextResponse } from "next/server";
import { resolveManagedEdition } from "@/lib/platform/dashboardServer";
import { getEditionInviteStatuses, getEditionPlayerProfiles } from "@/lib/platform/tournamentPlayersServer";

type Params = { params: Promise<{ tournament: string; year: string }> };

/**
 * Organizers only: { statuses: { <player id>: joined | invited | declined | none }, profiles: { <player id>: username } }
 * for this edition's players (profiles = joined players only, for profile links).
 */
export async function GET(_request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const [statuses, profiles] = await Promise.all([getEditionInviteStatuses(edition), getEditionPlayerProfiles(edition)]);
  if (!statuses) return NextResponse.json({ ok: false, error: "Player invitations aren't switched on yet." }, { status: 503 });
  return NextResponse.json({ ok: true, statuses, profiles }, { headers: { "Cache-Control": "no-store" } });
}
