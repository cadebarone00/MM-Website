import type { Metadata } from "next";
import { PlayMatches } from "@/components/platform/play/PlayTabs";
import { loadTournamentHome } from "@/lib/platform/tournamentHomeServer";

type Props = { params: Promise<{ tournament: string; year: string }> };

export const metadata: Metadata = { title: "Matches | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PlayMatchesPage({ params }: Props) {
  const { tournament, year } = await params;
  return <PlayMatches home={await loadTournamentHome(tournament, year)} />;
}
