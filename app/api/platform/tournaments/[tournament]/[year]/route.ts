import { NextResponse } from "next/server";
import { dashboardFailure, readinessFor } from "@/lib/platform/dashboardApi";
import { loadSetup, resolveManagedEdition } from "@/lib/platform/dashboardServer";

type Params = { params: Promise<{ tournament: string; year: string }> };

/** A tournament edition's saved setup plus its readiness. Organizers only; everyone else gets 404. */
export async function GET(_request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const result = await loadSetup(edition);
  if (!result.ok) {
    const failure = dashboardFailure(result.error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  return NextResponse.json({ ok: true, setup: result.value, readiness: readinessFor(result.value) }, { headers: { "Cache-Control": "no-store" } });
}
