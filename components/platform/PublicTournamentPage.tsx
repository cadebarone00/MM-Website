import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicBasePath, robotsFor } from "@/lib/platform/publicSite";
import { loadPublicTournament } from "@/lib/platform/publicSiteServer";
import { TournamentSiteView } from "./TournamentSiteView";

export { TournamentSiteView };

type Params = { tournament: string; year: string; section?: string };

/**
 * One page of a customer tournament's public site. Anything the visitor may
 * not see — unpublished, private without membership, unknown, or a section
 * the organizer turned off — is a plain 404.
 */
export async function PublicTournamentPage({ params }: { params: Params }) {
  const tournament = await loadPublicTournament(params.tournament, params.year);
  if (!tournament) notFound();
  return <TournamentSiteView tournament={tournament} section={params.section} basePath={publicBasePath(tournament.tournament.slug, tournament.edition.seasonYear)} />;
}

export async function publicTournamentMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tournament = await loadPublicTournament(params.tournament, params.year);
  if (!tournament) return { title: "Not found", robots: { index: false, follow: false } };
  const name = `${tournament.tournament.name} ${tournament.edition.seasonYear}`;
  return {
    title: name,
    description: tournament.tournament.description ?? `${name} tournament site.`,
    robots: robotsFor(tournament.tournament.visibility),
  };
}
