import { NextResponse } from "next/server";
import { resolveManagedEdition } from "@/lib/platform/dashboardServer";
import { getTournamentPlayerPool } from "@/lib/platform/tournamentPlayersServer";

type Params = { params: Promise<{ tournament: string; year: string }> };

/** Organizers only: this tournament's players who aren't on this edition yet (for "Add existing player"). */
export async function GET(_request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const players = await getTournamentPlayerPool(edition);
  if (!players) return NextResponse.json({ ok: false, error: "Existing players aren't available yet." }, { status: 503 });
  return NextResponse.json({ ok: true, players }, { headers: { "Cache-Control": "no-store" } });
}
