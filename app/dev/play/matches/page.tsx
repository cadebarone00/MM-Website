import type { Metadata } from "next";
import { PlayMatches } from "@/components/platform/play/PlayTabs";
import { loadPlayDemo } from "@/lib/platform/playDemo";

export const metadata: Metadata = { title: "Matches demo | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** LOCAL DEV DEMO (fixture data); 404 unless NODE_ENV=development and DEV_PLAY_DEMO=true. */
export default async function PlayDemoMatchesPage() {
  return <PlayMatches home={await loadPlayDemo()} />;
}
