import { notFound } from "next/navigation";
import { getTournament, nextTournament } from "@/lib/data";
import { ProjectedTournamentPage } from "@/components/leaderboard/ProjectedTournamentPage";
import { LiveProjectedTournamentPage } from "@/components/leaderboard/LiveProjectedTournamentPage";

export default async function ProjectedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === nextTournament.slug) return <LiveProjectedTournamentPage title={nextTournament.editionLabel} />;
  const tournament = getTournament(slug);
  if (!tournament) notFound();
  return <ProjectedTournamentPage tournament={tournament} />;
}
