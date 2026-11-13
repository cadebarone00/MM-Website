import { previewBasePath, publicBasePath } from "@/lib/platform/publicSite";
import type { TournamentPreview } from "@/lib/platform/publicSiteServer";
import { OrganizerStudioShell } from "./OrganizerStudioShell";
import { TournamentSiteView } from "./TournamentSiteView";
import styles from "./TournamentPreview.module.css";

// Kept apart from TournamentPreviewPage.tsx, whose loader is website-only, so the app can import it.
/** The preview banner and the site under it. Shared by the website's page and the iPhone / Android app's. */
export function TournamentPreviewView({ preview, section }: { preview: TournamentPreview; section?: string }) {
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
    <TournamentSiteView tournament={tournament} section={section} basePath={previewBasePath(slug, year)} />
  </OrganizerStudioShell>;
}
