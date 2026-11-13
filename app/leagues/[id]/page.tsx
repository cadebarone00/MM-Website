import type { Metadata } from "next";
import { LeagueHome } from "@/components/platform/LeagueHome";

export const metadata: Metadata = { title: "League | The Maroon", robots: { index: false } };

/** A league: members only (the page loads it from /api/leagues/<id>, which checks). */
export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeagueHome key={id} id={id} />;
}
