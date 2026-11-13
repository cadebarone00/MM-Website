"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CodeTournamentHome } from "@/components/platform/CodeTournamentHome";

/** App → a public tournament page (/tournaments/live/?id=…), read only. */
function AppLiveTournament() {
  const id = useSearchParams().get("id");
  return id ? <CodeTournamentHome id={id} meId={null} publicView /> : null;
}

export default function AppLiveTournamentPage() {
  return <Suspense><AppLiveTournament /></Suspense>;
}
