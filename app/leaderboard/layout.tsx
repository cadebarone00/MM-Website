import { SeasonCatalogProvider } from "@/components/SeasonCatalogProvider";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";

export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getSeasonCatalog("leaderboard");
  return <SeasonCatalogProvider key={catalog.nextTournament.year} initial={catalog} section="leaderboard">{children}</SeasonCatalogProvider>;
}
