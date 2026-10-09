import { NextResponse } from "next/server";
import { createNextEdition, resolveManagedEdition } from "@/lib/platform/dashboardServer";
import { nextEditionInputFromBody } from "@/lib/platform/nextEdition";
import { tournamentManageUrl } from "@/lib/platform/tournamentCreate";

type Params = { params: Promise<{ tournament: string; year: string }> };

/**
 * Start next year from this edition: POST { seasonYear, startDate?, endDate?, keepTeams?, playerIds }. Organizers only
 * (everyone else gets 404). Returning players are the same tournament players; the new edition's dashboard is next.
 */
export async function POST(request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const parsed = nextEditionInputFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error, field: parsed.field }, { status: 400 });
  const result = await createNextEdition(edition, parsed.input);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, url: tournamentManageUrl(result.tournamentSlug, result.seasonYear) }, { status: 201 });
}
