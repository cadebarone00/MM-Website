import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeEntrySplash } from "@/components/home/HomeEntrySplash";
import { VideoHero } from "@/components/home/VideoHero";
import { LiveLeaderboardStripSection } from "@/components/home/LiveLeaderboardStripSection";
import { getNextTournamentOverride } from "@/lib/data/activeSeasonOverlay";

export default async function Home() {
  const nextTournamentOverride = await getNextTournamentOverride();
  return (
    <HomeEntrySplash>
      <div>
        <VideoHero nextTournamentOverride={nextTournamentOverride} />
        <LiveLeaderboardStripSection />
        <HomeDashboard nextTournamentOverride={nextTournamentOverride} />
      </div>
    </HomeEntrySplash>
  );
}
