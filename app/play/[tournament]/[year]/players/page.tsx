import type { Metadata } from "next";
import { PlayPlayers } from "@/components/platform/play/PlayTabs";
import { loadTournamentHome } from "@/lib/platform/tournamentHomeServer";

type Props = { params: Promise<{ tournament: string; year: string }> };

export const metadata: Metadata = { title: "Players | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PlayPlayersPage({ params }: Props) {
  const { tournament, year } = await params;
  return <PlayPlayers home={await loadTournamentHome(tournament, year)} />;
}
