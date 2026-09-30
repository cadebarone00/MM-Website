import type { Metadata } from "next";
import { TournamentHomeScreen } from "@/components/platform/play/TournamentHomeScreen";
import { loadTournamentHome } from "@/lib/platform/tournamentHomeServer";

type Props = { params: Promise<{ tournament: string; year: string }> };

export const metadata: Metadata = { title: "Tournament Home | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The logged-in league home for a tournament. The public website stays at /t/[tournament]/[year]. */
export default async function PlayHomePage({ params }: Props) {
  const { tournament, year } = await params;
  return <TournamentHomeScreen home={await loadTournamentHome(tournament, year)} />;
}
