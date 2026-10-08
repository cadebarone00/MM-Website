import { NextResponse } from "next/server";
import { resolveManagedEdition } from "@/lib/platform/dashboardServer";
import { getEditionInviteStatuses } from "@/lib/platform/tournamentPlayersServer";

type Params = { params: Promise<{ tournament: string; year: string }> };

/** Organizers only: { statuses: { <player id>: joined | invited | declined | none } } for this edition's players. */
export async function GET(_request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const statuses = await getEditionInviteStatuses(edition);
  if (!statuses) return NextResponse.json({ ok: false, error: "Player invitations aren't switched on yet." }, { status: 503 });
  return NextResponse.json({ ok: true, statuses }, { headers: { "Cache-Control": "no-store" } });
}
