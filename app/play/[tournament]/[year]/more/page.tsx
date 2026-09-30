import type { Metadata } from "next";
import { PlayMore } from "@/components/platform/play/PlayTabs";
import { loadTournamentHome } from "@/lib/platform/tournamentHomeServer";

type Props = { params: Promise<{ tournament: string; year: string }> };

export const metadata: Metadata = { title: "More | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PlayMorePage({ params }: Props) {
  const { tournament, year } = await params;
  return <PlayMore home={await loadTournamentHome(tournament, year)} />;
}
