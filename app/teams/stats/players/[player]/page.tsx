import PlayerCareerPage from "@/components/stats/PlayerCareerPage";
export { generateStaticParams } from "@/components/stats/PlayerCareerPage";
export default function PlayerStatsPage({ params }: { params: Promise<{ player: string }> }) {
  return <PlayerCareerPage params={params} />;
}