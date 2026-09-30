import { TournamentPreviewPage, tournamentPreviewMetadata } from "@/components/platform/TournamentPreviewPage";

type Props = { params: Promise<{ tournament: string; year: string; section: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  return tournamentPreviewMetadata({ params: await params });
}

/** Organizer-only preview of one public-site section. */
export default async function PreviewSectionPage({ params }: Props) {
  return <TournamentPreviewPage params={await params} />;
}
