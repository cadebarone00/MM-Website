import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import PlayerCareerPage from "@/components/stats/PlayerCareerPage";

export default async function PortalCareerPage() {
  const player = await requirePlayer();
  if (!player) redirect("/portal");
  return <PlayerCareerPage params={Promise.resolve({ player: player.playerFirstName.toLowerCase() })} inPortal />;
}
