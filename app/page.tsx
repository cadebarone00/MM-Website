import { HomeDashboard } from "@/components/home/HomeDashboard";
import { VideoHero } from "@/components/home/VideoHero";
import { LiveLeaderboardStripSection } from "@/components/home/LiveLeaderboardStripSection";

export default function Home() {
  return (
    <div>
      <VideoHero />
      <LiveLeaderboardStripSection />
      <HomeDashboard />
    </div>
  );
}
