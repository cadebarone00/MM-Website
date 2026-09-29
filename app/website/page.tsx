import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeEntrySplash } from "@/components/home/HomeEntrySplash";
import { VideoHero } from "@/components/home/VideoHero";
import { LiveLeaderboardStripSection } from "@/components/home/LiveLeaderboardStripSection";
import { getNextTournamentOverride, getUpcomingRoundSchedule } from "@/lib/data/activeSeasonOverlay";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
import { SeasonCatalogProvider } from "@/components/SeasonCatalogProvider";

export default async function Home() {
  const [nextTournamentOverride, resultsCatalog, teamsCatalog, scheduleCatalog] = await Promise.all([
    getNextTournamentOverride(),
    getSeasonCatalog("home_results"), getSeasonCatalog("home_teams"), getSeasonCatalog("home_schedule"),
  ]);
  const rounds = await getUpcomingRoundSchedule(scheduleCatalog.nextTournament.year);
  return (
    <HomeEntrySplash>
      <div>
        <div data-website-section="home"><VideoHero nextTournamentOverride={nextTournamentOverride} /></div>
        <div data-website-section="home_results"><SeasonCatalogProvider key={resultsCatalog.nextTournament.year} initial={resultsCatalog} section="home_results"><LiveLeaderboardStripSection /></SeasonCatalogProvider></div>
        <HomeDashboard nextTournamentOverride={nextTournamentOverride} rounds={rounds} teamsCatalog={teamsCatalog} scheduleCatalog={scheduleCatalog} />
      </div>
    </HomeEntrySplash>
  );
}
