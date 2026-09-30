import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentSite, type SitePage } from "@/components/platform/tournament-site";
import { isPublicPage, publicBasePath, publicPages, publicSiteLinks, robotsFor, toSiteData, type PublicTournament } from "@/lib/platform/publicSite";
import { loadPublicTournament } from "@/lib/platform/publicSiteServer";

type Params = { tournament: string; year: string; section?: string };

/**
 * The one rendering of a customer tournament site, used by the public site
 * and by the organizer preview so they can never look different. A section
 * the organizer turned off is a 404 here in both.
 */
export function TournamentSiteView({ tournament, section, basePath }: { tournament: PublicTournament; section?: string; basePath: string }) {
  const page: SitePage = section === undefined ? "home" : isPublicPage(section, tournament.site) ? section : notFound();
  const links = publicSiteLinks(tournament.tournament.slug, tournament.edition.seasonYear, publicPages(tournament.site), basePath);
  return <TournamentSite data={toSiteData(tournament)} page={page} links={links} />;
}

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
