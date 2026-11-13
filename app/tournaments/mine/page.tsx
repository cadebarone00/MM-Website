import type { Metadata } from "next";
import { MyPlayingTournamentsPage } from "@/components/platform/MyPlayingTournamentsPage";
import { loadMyPlaying } from "@/lib/platform/tourneyScreensData";

export const metadata: Metadata = { title: "My Tournaments | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Tourneys → My Tournaments: the tournaments you're playing in; each one enters its Tournament Home. */
export default async function MinePage() {
  return <MyPlayingTournamentsPage mine={await loadMyPlaying()} />;
}
