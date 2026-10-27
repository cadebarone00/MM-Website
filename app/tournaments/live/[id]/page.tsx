import type { Metadata } from "next";
import { CodeTournamentHome } from "@/components/platform/CodeTournamentHome";

export const metadata: Metadata = { title: "Tournament | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** A public tournament, from the Tourneys search or live feed: its leaderboard and tee sheet, read only (no sign-in). */
export default async function PublicTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CodeTournamentHome id={id} meId={null} publicView />;
}
