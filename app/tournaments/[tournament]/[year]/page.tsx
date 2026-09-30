import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flag } from "lucide-react";
import { readinessFor } from "@/lib/platform/dashboardApi";
import { loadSetup, resolveManagedEdition } from "@/lib/platform/dashboardServer";
import { OrganizerStudioShell } from "@/components/platform/OrganizerStudioShell";
import { SavedTournamentDashboard } from "@/components/tournament-dashboard/SavedTournamentDashboard";
import styles from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";

export const metadata: Metadata = { title: "Tournament setup | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A saved tournament's dashboard (COMPLETE → PUBLISH). It manages the same
 * Tournament + Edition the public site will show at /t/[tournament]/[year].
 * Organizers only: everyone else, signed out or not, gets a plain 404 so a
 * private tournament's existence isn't revealed.
 */
export default async function TournamentDashboardPage({ params }: { params: Promise<{ tournament: string; year: string }> }) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) notFound();
  const result = await loadSetup(edition);
  if (!result.ok) notFound();
  const setup = result.value;

  const studioTournament = { name: setup.tournament.name, slug: setup.tournament.slug, year: setup.edition.seasonYear, published: Boolean(setup.edition.publishedAt), previewable: !setup.tournament.isLegacy };

  return <OrganizerStudioShell page="setup" tournament={studioTournament}><main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><Flag size={16} aria-hidden="true" /> THE MAROON / TOURNAMENT STUDIO</div>
      <p className={styles.lifecycle}>CREATE <span>&rarr;</span> EXIST <span>&rarr;</span> COMPLETE <span>&rarr;</span> PUBLISH <span>&rarr;</span> PLAY</p>
      <h1>{setup.tournament.name} {setup.edition.seasonYear}</h1>
      <p>Only this tournament&apos;s organizers can see this page. Each section saves on its own.</p>
    </header>
    <SavedTournamentDashboard
      initialSetup={setup}
      initialReadiness={readinessFor(setup)}
      apiBase={`/api/platform/tournaments/${encodeURIComponent(setup.tournament.slug)}/${setup.edition.seasonYear}`}
      readOnlyReason={setup.tournament.isLegacy ? "The Maroon Tournament is managed in the Admin Center, so this page is read-only for it." : undefined}
    />
  </main></OrganizerStudioShell>;
}
