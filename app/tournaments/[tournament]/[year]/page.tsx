import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioDashboardView } from "@/components/tournament-dashboard/StudioViews";
import { loadStudio } from "@/lib/platform/tournamentScreensData";

export const metadata: Metadata = { title: "Tournament setup | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A saved tournament's dashboard (COMPLETE → PUBLISH). It manages the same
 * Tournament + Edition the public site will show at /t/[tournament]/[year].
 * Organizers only: everyone else, signed out or not, gets a plain 404 so a
 * private tournament's existence isn't revealed.
 */
export default async function TournamentDashboardPage({ params }: { params: Promise<{ tournament: string; year: string }> }) {
  const { tournament, year } = await params;
  const studio = await loadStudio(tournament, year);
  if (!studio) notFound();
  return <StudioDashboardView {...studio} />;
}
