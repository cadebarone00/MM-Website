import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import PlayerCareerPage from "@/components/stats/PlayerCareerPage";

export default async function PortalCareerPage() {
  const player = await requirePlayer();
  if (!player) redirect("/portal");
  // Pass the slug, not the first name: a first name is only an alias and would
  // resolve to a hand-written player who happens to share it. resolvePlayer
  // checks exact ids/slugs first, so the hand-written players resolve exactly
  // as before.
  return <PlayerCareerPage params={Promise.resolve({ player: player.playerSlug })} inPortal />;
}
