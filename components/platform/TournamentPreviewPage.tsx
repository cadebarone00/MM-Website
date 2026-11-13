import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadTournamentPreview } from "@/lib/platform/publicSiteServer";
import { TournamentPreviewView } from "./TournamentPreviewView";

type Params = { tournament: string; year: string; section?: string };

/**
 * Organizer-only preview of the public site: the exact same TournamentSiteView
 * the public site uses, under a preview banner that never appears on the real
 * site. Everyone who can't manage the tournament gets a plain 404.
 */
export async function TournamentPreviewPage({ params }: { params: Params }) {
  const preview = await loadTournamentPreview(params.tournament, params.year);
  if (!preview) notFound();
  return <TournamentPreviewView preview={preview} section={params.section} />;
}

export async function tournamentPreviewMetadata({ params }: { params: Params }): Promise<Metadata> {
  const preview = await loadTournamentPreview(params.tournament, params.year);
  return {
    title: preview ? `Preview · ${preview.tournament.tournament.name} ${preview.tournament.edition.seasonYear}` : "Not found",
    robots: { index: false, follow: false },
  };
}
