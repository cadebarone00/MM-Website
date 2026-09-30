import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentSite, type SitePage } from "@/components/platform/tournament-site";
import { isPublicPage, publicPages, publicSiteLinks, robotsFor, toSiteData } from "@/lib/platform/publicSite";
import { loadPublicTournament } from "@/lib/platform/publicSiteServer";

type Params = { tournament: string; year: string; section?: string };

/**
 * One page of a customer tournament's public site, rendered with the public
 * UI kit. Anything the visitor may not see — unpublished, private without
 * membership, unknown, or a section the organizer turned off — is a plain 404.
 */
export async function PublicTournamentPage({ params }: { params: Params }) {
  const tournament = await loadPublicTournament(params.tournament, params.year);
  if (!tournament) notFound();
  const page: SitePage = params.section === undefined ? "home" : isPublicPage(params.section, tournament.site) ? params.section : notFound();
  const links = publicSiteLinks(tournament.tournament.slug, tournament.edition.seasonYear, publicPages(tournament.site));
  return <TournamentSite data={toSiteData(tournament)} page={page} links={links} />;
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
