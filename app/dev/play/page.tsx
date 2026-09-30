import type { Metadata } from "next";
import { TournamentHomeScreen } from "@/components/platform/play/TournamentHomeScreen";
import { loadPlayDemo } from "@/lib/platform/playDemo";

export const metadata: Metadata = { title: "Tournament Home demo | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** LOCAL DEV DEMO of /play (fixture data). 404 unless NODE_ENV=development and DEV_PLAY_DEMO=true — see lib/platform/playDemo.ts. */
export default async function PlayDemoHomePage() {
  return <TournamentHomeScreen home={await loadPlayDemo()} />;
}
