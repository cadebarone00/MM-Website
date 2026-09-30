import { NextResponse } from "next/server";
import { dashboardFailure, publishDecision, readinessFor } from "@/lib/platform/dashboardApi";
import { loadSetup, resolveManagedEdition, setPublished } from "@/lib/platform/dashboardServer";

type Params = { params: Promise<{ tournament: string; year: string }> };

/**
 * PUBLISH (separate from CREATE and from section saves). Publishing is only
 * allowed when the readiness engine says the saved setup is ready — checked
 * here on the server, whatever the page shows. Unpublishing is always allowed.
 */
export async function POST(request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  let publish: unknown;
  try {
    publish = ((await request.json()) as { publish?: unknown }).publish;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (typeof publish !== "boolean") return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const current = await loadSetup(edition);
  if (!current.ok) {
    const failure = dashboardFailure(current.error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  const decision = publishDecision(current.value, publish);
  if (!decision.ok) return NextResponse.json({ ok: false, error: decision.error, missing: decision.missing }, { status: decision.status });

  const result = await setPublished(edition, publish);
  if (!result.ok) {
    const failure = dashboardFailure(result.error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  return NextResponse.json({ ok: true, setup: result.value, readiness: readinessFor(result.value) });
}
