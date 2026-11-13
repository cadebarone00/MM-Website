import { Flag } from "lucide-react";
import { OrganizerStudioShell } from "@/components/platform/OrganizerStudioShell";
import { SavedTournamentDashboard } from "./SavedTournamentDashboard";
import { NextEditionForm } from "./NextEditionForm";
import type { NextYearData, StudioData } from "@/lib/platform/tournamentScreensData";
import styles from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";

const studioTournament = (setup: StudioData["setup"]) =>
  ({ name: setup.tournament.name, slug: setup.tournament.slug, year: setup.edition.seasonYear, published: Boolean(setup.edition.publishedAt), previewable: !setup.tournament.isLegacy });
const apiBase = (setup: StudioData["setup"]) => `/api/platform/tournaments/${encodeURIComponent(setup.tournament.slug)}/${setup.edition.seasonYear}`;

/** A saved tournament's dashboard (COMPLETE → PUBLISH). Shared by the website's page and the iPhone / Android app's. */
export function StudioDashboardView({ setup, readiness }: StudioData) {
  return <OrganizerStudioShell page="setup" tournament={studioTournament(setup)}><main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><Flag size={16} aria-hidden="true" /> THE MAROON / TOURNAMENT STUDIO</div>
      <p className={styles.lifecycle}>CREATE <span>&rarr;</span> EXIST <span>&rarr;</span> COMPLETE <span>&rarr;</span> PUBLISH <span>&rarr;</span> PLAY</p>
      <h1>{setup.tournament.name} {setup.edition.seasonYear}</h1>
      <p>Only this tournament&apos;s organizers can see this page. Each section saves on its own.</p>
    </header>
    <SavedTournamentDashboard initialSetup={setup} initialReadiness={readiness} apiBase={apiBase(setup)}
      readOnlyReason={setup.tournament.isLegacy ? "The Maroon Tournament is managed in the Admin Center, so this page is read-only for it." : undefined} />
  </main></OrganizerStudioShell>;
}

/** Start next year: a new edition of this same tournament. Shared by the website's page and the app's. */
export function NextYearView({ setup, draft }: NextYearData) {
  return <OrganizerStudioShell page="next" tournament={studioTournament(setup)}><main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><Flag size={16} aria-hidden="true" /> THE MAROON / TOURNAMENT STUDIO</div>
      <h1>Start next year of {setup.tournament.name}</h1>
      <p>Same tournament, a new edition. Pick who&apos;s coming back; everyone else can return another year.</p>
    </header>
    {draft
      ? <NextEditionForm draft={draft} apiBase={apiBase(setup)} />
      : <p className={styles.callout}>{setup.tournament.isLegacy ? "The Maroon Tournament's years are created in the Admin Center." : "Starting a new year isn't switched on yet."}</p>}
  </main></OrganizerStudioShell>;
}
