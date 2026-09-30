import { redirect } from "next/navigation";
import { requireHost } from "@/lib/portal/requireHost";
import { getWebsiteSettings } from "@/lib/website/settingsServer";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { WEBSITE_SECTIONS } from "@/lib/website/settings";
import { WebsiteEditor } from "@/components/portal/admin/WebsiteEditor";

export default async function WebsiteEditorPage() {
  if (!await requireHost()) redirect("/login");
  const [{ settings, available }, years, players] = await Promise.all([
    getWebsiteSettings(),
    Promise.all(WEBSITE_SECTIONS.map(async section => [section.key, (await getSeasonCatalog(section.key)).nextTournament.year] as const)),
    getAllPlayerRows(),
  ]);
  return <WebsiteEditor initial={settings} available={available} effectiveYears={Object.fromEntries(years)} players={players.map(player => ({ slug: player.playerSlug, name: player.fullName }))} />;
}
