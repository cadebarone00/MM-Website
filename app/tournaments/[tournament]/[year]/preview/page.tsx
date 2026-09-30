import { TournamentPreviewPage, tournamentPreviewMetadata } from "@/components/platform/TournamentPreviewPage";

type Props = { params: Promise<{ tournament: string; year: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  return tournamentPreviewMetadata({ params: await params });
}

/** Organizer-only preview of the public site's home page. */
export default async function PreviewHomePage({ params }: Props) {
  return <TournamentPreviewPage params={await params} />;
}
