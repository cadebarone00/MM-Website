import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { previewBasePath, publicBasePath } from "@/lib/platform/publicSite";
import { loadTournamentPreview } from "@/lib/platform/publicSiteServer";
import { OrganizerStudioShell } from "./OrganizerStudioShell";
import { TournamentSiteView } from "./PublicTournamentPage";
import styles from "./TournamentPreview.module.css";

type Params = { tournament: string; year: string; section?: string };

/**
 * Organizer-only preview of the public site: the exact same TournamentSiteView
 * the public site uses, under a preview banner that never appears on the real
 * site. Everyone who can't manage the tournament gets a plain 404.
 */
export async function TournamentPreviewPage({ params }: { params: Params }) {
  const preview = await loadTournamentPreview(params.tournament, params.year);
  if (!preview) notFound();
  const { tournament, published } = preview;
  const slug = tournament.tournament.slug;
  const year = tournament.edition.seasonYear;
  const publicPath = publicBasePath(slug, year);
  const audience = tournament.tournament.visibility === "private" ? "only this tournament's members" : tournament.tournament.visibility === "unlisted" ? "anyone with the link" : "everyone";
  return <OrganizerStudioShell page="preview" tournament={{ name: tournament.tournament.name, slug, year, published, previewable: true }}>
    <aside className={styles.banner} role="note" aria-label="Preview">
      <p>
        <strong>{published ? "Preview — this is your published site." : "Preview — this tournament is not public yet."}</strong>{" "}
        {published ? `Visitors (${audience}) see it at ${publicPath}.` : `Once published, ${audience} will see it at ${publicPath}.`}
      </p>
      <a href={`/tournaments/${encodeURIComponent(slug)}/${year}`}>Back to setup</a>
    </aside>
    <TournamentSiteView tournament={tournament} section={params.section} basePath={previewBasePath(slug, year)} />
  </OrganizerStudioShell>;
}

export async function tournamentPreviewMetadata({ params }: { params: Params }): Promise<Metadata> {
  const preview = await loadTournamentPreview(params.tournament, params.year);
  return {
    title: preview ? `Preview · ${preview.tournament.tournament.name} ${preview.tournament.edition.seasonYear}` : "Not found",
    robots: { index: false, follow: false },
  };
}
