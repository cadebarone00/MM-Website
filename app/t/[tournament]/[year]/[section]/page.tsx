import { PublicTournamentPage, publicTournamentMetadata } from "@/components/platform/PublicTournamentPage";

type Props = { params: Promise<{ tournament: string; year: string; section: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  return publicTournamentMetadata({ params: await params });
}

/** /t/[tournament]/[year]/schedule, /players, /teams, /courses, /information, /leaderboard, /matches, /results. */
export default async function TournamentSectionPage({ params }: Props) {
  return <PublicTournamentPage params={await params} />;
}
