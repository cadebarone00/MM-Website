import { notFound } from "next/navigation";
import { TournamentSite, type SitePage } from "@/components/platform/tournament-site";
import { isPublicPage, publicPages, publicSiteLinks, toSiteData, type PublicTournament } from "@/lib/platform/publicSite";

// Kept apart from PublicTournamentPage.tsx, whose loader is website-only, so the app can import it.
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
