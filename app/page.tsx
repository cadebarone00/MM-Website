import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeEntrySplash } from "@/components/home/HomeEntrySplash";
import { VideoHero } from "@/components/home/VideoHero";
import { LiveLeaderboardStripSection } from "@/components/home/LiveLeaderboardStripSection";

export default function Home() {
  return (
    <HomeEntrySplash>
      <div>
        <VideoHero />
        <LiveLeaderboardStripSection />
        <HomeDashboard />
      </div>
    </HomeEntrySplash>
  );
}
