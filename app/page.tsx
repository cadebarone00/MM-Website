import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeEntrySplash } from "@/components/home/HomeEntrySplash";
import { VideoHero } from "@/components/home/VideoHero";
import { LiveLeaderboardStripSection } from "@/components/home/LiveLeaderboardStripSection";
import { getNextTournamentOverride, getUpcomingRoundSchedule } from "@/lib/data/activeSeasonOverlay";

export default async function Home() {
  const [nextTournamentOverride, rounds] = await Promise.all([
    getNextTournamentOverride(),
    getUpcomingRoundSchedule(),
  ]);
  return (
    <HomeEntrySplash>
      <div>
        <VideoHero nextTournamentOverride={nextTournamentOverride} />
        <LiveLeaderboardStripSection />
        <HomeDashboard nextTournamentOverride={nextTournamentOverride} rounds={rounds} />
      </div>
    </HomeEntrySplash>
  );
}
