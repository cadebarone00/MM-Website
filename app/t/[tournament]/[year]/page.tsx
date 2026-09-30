import { PublicTournamentPage, publicTournamentMetadata } from "@/components/platform/PublicTournamentPage";

type Props = { params: Promise<{ tournament: string; year: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  return publicTournamentMetadata({ params: await params });
}

export default async function TournamentHomePage({ params }: Props) {
  return <PublicTournamentPage params={await params} />;
}
