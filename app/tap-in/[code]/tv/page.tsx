import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveTvPage } from "@/components/tap-in/LiveTvPage";
import { isTvShow } from "@/lib/platform/liveTv";
import { tapInPath } from "@/lib/platform/tapIn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TV mode | The Maroon Live", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * The Maroon Live TV mode (project_specs.md, Step 4): the live link plus /tv, full screen for a big screen.
 * ?show=individual|match|both is the organizer's pick (Settings → Who can watch → TV mode); both when missing.
 * A Stats button slides the trip's stats insights out on the right (owner 2026-11-23).
 * Same watch-code rules as the live page: Private or deleted events say "This event isn't available."
 */
export default async function TapInTvPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ show?: string }> }) {
  const path = tapInPath((await params).code);
  if (!path) notFound();
  const { show } = await searchParams;
  return <LiveTvPage code={path.slice(path.lastIndexOf("/") + 1)} show={isTvShow(show) ? show : "both"} withStats />;
}
