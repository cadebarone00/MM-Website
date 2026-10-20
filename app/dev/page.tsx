import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevSimulator } from "@/components/dev/DevSimulator";
import { simulatorPages } from "@/lib/dev/simulatorRoutes";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { adaptTournamentToDraft } from "@/lib/platform/tournamentToGolfTrip";

export const metadata: Metadata = { title: "App simulator | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DevPage({ searchParams }: { searchParams: Promise<{ group?: string | string[] }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { group } = await searchParams;
  return <DevSimulator pages={simulatorPages()} initialGroup={typeof group === "string" ? group : undefined} unmapped={adaptTournamentToDraft(palmSprings2026).unmapped} />;
}
