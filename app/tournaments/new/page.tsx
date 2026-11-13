import type { Metadata } from "next";
import { loadMyAccess } from "@/lib/platform/accessRequestsServer";
import { tierFromParam } from "@/lib/platform/createTiers";
import { NewTournamentView } from "@/components/platform/TourneyAccessViews";

export const metadata: Metadata = { title: "Create a tournament | The Maroon", description: "Plan your tournament with a quick draft and a guided setup checklist." };

export const dynamic = "force-dynamic";

export default async function NewTournamentPage({ searchParams }: { searchParams: Promise<{ tier?: string | string[] }> }) {
  return <NewTournamentView tier={tierFromParam((await searchParams).tier)} result={await loadMyAccess()} />;
}
