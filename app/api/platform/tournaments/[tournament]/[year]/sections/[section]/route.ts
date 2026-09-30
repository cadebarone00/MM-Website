import { NextResponse } from "next/server";
import { dashboardFailure, readinessFor } from "@/lib/platform/dashboardApi";
import { loadSetup, resolveManagedEdition, saveSection } from "@/lib/platform/dashboardServer";
import { isSectionKey, validateSection } from "@/lib/platform/sectionRules";

type Params = { params: Promise<{ tournament: string; year: string; section: string }> };

/**
 * Saves one Tournament Dashboard section. The section rules run here, on the
 * server, against the current saved setup; save_tournament_section checks the
 * organizer again and writes only platform tables (never live scoring).
 */
export async function PATCH(request: Request, { params }: Params) {
  const { tournament, year, section } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  if (!isSectionKey(section)) return NextResponse.json({ ok: false, error: "Unknown section." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const current = await loadSetup(edition);
  if (!current.ok) {
    const failure = dashboardFailure(current.error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  const checked = validateSection(section, body, current.value);
  if (!checked.ok) return NextResponse.json({ ok: false, error: "Check these details.", errors: checked.errors }, { status: 400 });

  const saved = await saveSection(edition, section, checked.data);
  if (!saved.ok) {
    const failure = dashboardFailure(saved.error);
    if (failure.status === 500) console.error(`save_tournament_section(${section}) failed:`, saved.error.message);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  return NextResponse.json({ ok: true, setup: saved.value, readiness: readinessFor(saved.value) });
}
