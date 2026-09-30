import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flag } from "lucide-react";
import { requireTournamentRole } from "@/lib/platform/tournamentAccess";
import { loadSavedTournament } from "@/lib/platform/savedTournamentServer";
import { TournamentSetupDashboard } from "@/components/tournament-draft/TournamentSetupDashboard";
import styles from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";

export const metadata: Metadata = { title: "Tournament setup | The Maroon", robots: { index: false } };

/**
 * A saved tournament's setup dashboard (EXIST → COMPLETE). Organizers only:
 * anyone else, signed out or not, gets a plain 404 so a private tournament's
 * existence isn't revealed. The public site will live at /t/[tournament]/[year].
 */
export default async function TournamentDashboardPage({ params }: { params: Promise<{ tournament: string; year: string }> }) {
  const { tournament: slug, year } = await params;
  const seasonYear = Number(year);
  if (!Number.isInteger(seasonYear)) notFound();

  const access = await requireTournamentRole(slug, "organizer");
  if (!access) notFound();
  const draft = await loadSavedTournament(access.tournamentId, seasonYear);
  if (!draft) notFound();

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><Flag size={16} aria-hidden="true" /> THE MAROON / TOURNAMENT STUDIO</div>
      <p className={styles.lifecycle}>CREATE <span>&rarr;</span> EXIST <span>&rarr;</span> COMPLETE <span>&rarr;</span> PUBLISH <span>&rarr;</span> PLAY</p>
      <h1>{draft.basics.name}</h1>
      <p>Saved to your account. Only this tournament&apos;s organizers can see this page.</p>
    </header>
    <TournamentSetupDashboard draft={draft} savedNote={`Your tournament exists. Its site will live at themaroon.com/t/${draft.basics.slug}/${draft.seasonYear} once publishing opens. Editing each section from here comes next.`} />
  </main>;
}
