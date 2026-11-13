"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { NewTournamentView } from "@/components/platform/TourneyAccessViews";
import { tierFromParam } from "@/lib/platform/createTiers";
import type { MyAccessResult } from "@/lib/platform/accessRequestsServer";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → New tournament (the organizer studio), with your creator access from the server. */
function AppNewTournament() {
  const tier = tierFromParam(useSearchParams().get("tier") ?? undefined);
  const [state, reload] = useAppData<MyAccessResult>("/api/app/tourneys");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  return <NewTournamentView tier={tier} result={state.data} />;
}

export default function AppNewTournamentPage() {
  return <Suspense><AppNewTournament /></Suspense>;
}
