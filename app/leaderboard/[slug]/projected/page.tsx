import { notFound, redirect } from "next/navigation";
import { getSeasonCatalog, getCatalogTournament, nativeSeasonYear } from "@/lib/data/seasonCatalog";
import { ProjectedTournamentPage } from "@/components/leaderboard/ProjectedTournamentPage";
import { LiveProjectedTournamentPage } from "@/components/leaderboard/LiveProjectedTournamentPage";

/** Picks the year the same way `/leaderboard/[slug]` does, so Projected always matches the leaderboard. */
export default async function ProjectedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getSeasonCatalog();
  if (slug === catalog.nextTournament.slug && nativeSeasonYear(slug)) {
    if (!catalog.leaderboardOpen) redirect(`/leaderboard/${catalog.latestCompleted.slug}/projected`);
    return <LiveProjectedTournamentPage title={catalog.nextTournament.editionLabel} slug={slug} />;
  }
  const tournament = await getCatalogTournament(slug);
  if (!tournament) notFound();
  return <ProjectedTournamentPage tournament={tournament} />;
}
