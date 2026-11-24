import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveTvBoard } from "@/components/tap-in/LiveTvBoard";
import { sampleTvBoard } from "@/lib/dev/sampleTv";
import { isTvPhase, isTvShow } from "@/lib/platform/liveTv";
import { isLiveSurface, isTvGroup, isTvKind, isTvTeams } from "@/lib/dev/livePreviews";

export const metadata: Metadata = { title: "TV mode design | The Maroon", robots: { index: false, follow: false } };

/**
 * DEV ONLY: The Maroon Live TV mode with made-up players (project_specs.md, Step 4 design). Try it at
 * /dev/tv?show=individual|match|both&players=24 (2–24)&surface=desktop|mobile|app (the simulator's View)
 * &phase=before|live|between|final&kind=trip|tournament|league&teams=two|pairs|3ball|4ball&group=2|3|4 (the simulator's Conditionals). Nothing is loaded or saved.
 */
export default async function DevTvPage({ searchParams }: { searchParams: Promise<{ show?: string; players?: string; surface?: string; phase?: string; kind?: string; teams?: string; group?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { show, players, surface, phase, kind, teams, group } = await searchParams;
  return <LiveTvBoard data={sampleTvBoard(Number(players) || 24, isTvPhase(phase) ? phase : "live", isTvKind(kind) ? kind : "trip", isTvTeams(teams) ? teams : "two", isTvGroup(group) ? group : "2")} show={isTvShow(show) ? show : "both"} surface={isLiveSurface(surface) ? surface : "desktop"} />;
}
