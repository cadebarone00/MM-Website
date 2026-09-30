import type { Metadata } from "next";
import { PlayPlayers } from "@/components/platform/play/PlayTabs";
import { loadPlayDemo } from "@/lib/platform/playDemo";

export const metadata: Metadata = { title: "Players demo | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** LOCAL DEV DEMO (fixture data); 404 unless NODE_ENV=development and DEV_PLAY_DEMO=true. */
export default async function PlayDemoPlayersPage() {
  return <PlayPlayers home={await loadPlayDemo()} />;
}
