import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flag } from "lucide-react";
import { getNextEditionDraft, loadSetup, resolveManagedEdition } from "@/lib/platform/dashboardServer";
import { OrganizerStudioShell } from "@/components/platform/OrganizerStudioShell";
import { NextEditionForm } from "@/components/tournament-dashboard/NextEditionForm";
import styles from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";

export const metadata: Metadata = { title: "Start next year | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Start next year: a new edition of this same tournament, started from this edition. Organizers only (everyone else
 * gets 404, like the dashboard). Returning golfers are picked from the tournament's own players — the same players,
 * with fresh roster rows — and new players are added on the new edition's dashboard.
 */
export default async function StartNextYearPage({ params }: { params: Promise<{ tournament: string; year: string }> }) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) notFound();
  const [setupResult, draft] = await Promise.all([loadSetup(edition), getNextEditionDraft(edition)]);
  if (!setupResult.ok) notFound();
  const setup = setupResult.value;
  const studioTournament = { name: setup.tournament.name, slug: setup.tournament.slug, year: setup.edition.seasonYear, published: Boolean(setup.edition.publishedAt), previewable: !setup.tournament.isLegacy };

  return <OrganizerStudioShell page="next" tournament={studioTournament}><main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><Flag size={16} aria-hidden="true" /> THE MAROON / TOURNAMENT STUDIO</div>
      <h1>Start next year of {setup.tournament.name}</h1>
      <p>Same tournament, a new edition. Pick who&apos;s coming back; everyone else can return another year.</p>
    </header>
    {draft
      ? <NextEditionForm draft={draft} apiBase={`/api/platform/tournaments/${encodeURIComponent(setup.tournament.slug)}/${setup.edition.seasonYear}`} />
      : <p className={styles.callout}>{setup.tournament.isLegacy ? "The Maroon Tournament's years are created in the Admin Center." : "Starting a new year isn't switched on yet."}</p>}
  </main></OrganizerStudioShell>;
}
