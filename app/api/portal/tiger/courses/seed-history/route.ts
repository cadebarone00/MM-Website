import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { seedHistoricalCourseLibrary } from "@/lib/live/seedHistoricalCourseLibrary";

/** One-time, idempotent import of the corrected 2024–2026 course setups. */
export async function POST() {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, ...(await seedHistoricalCourseLibrary()) });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save the historical courses." }, { status: 500 });
  }
}
