import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveTvBoard } from "@/components/tap-in/LiveTvBoard";
import { sampleTvBoard } from "@/lib/dev/sampleTv";
import { isTvShow } from "@/lib/platform/liveTv";

export const metadata: Metadata = { title: "TV mode design | The Maroon", robots: { index: false, follow: false } };

/**
 * DEV ONLY: The Maroon Live TV mode with made-up players (project_specs.md, Step 4 design). Try it at
 * /dev/tv?show=individual|match|both&players=24 (2–24). Nothing is loaded or saved.
 */
export default async function DevTvPage({ searchParams }: { searchParams: Promise<{ show?: string; players?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { show, players } = await searchParams;
  return <LiveTvBoard data={sampleTvBoard(Number(players) || 24)} show={isTvShow(show) ? show : "both"} />;
}
