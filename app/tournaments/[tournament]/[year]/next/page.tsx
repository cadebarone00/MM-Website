import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextYearView } from "@/components/tournament-dashboard/StudioViews";
import { loadNextYear } from "@/lib/platform/tournamentScreensData";

export const metadata: Metadata = { title: "Start next year | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Start next year: a new edition of this same tournament, started from this edition. Organizers only (everyone else
 * gets 404, like the dashboard). Returning golfers are picked from the tournament's own players — the same players,
 * with fresh roster rows — and new players are added on the new edition's dashboard.
 */
export default async function StartNextYearPage({ params }: { params: Promise<{ tournament: string; year: string }> }) {
  const { tournament, year } = await params;
  const next = await loadNextYear(tournament, year);
  if (!next) notFound();
  return <NextYearView {...next} />;
}
