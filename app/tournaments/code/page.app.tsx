"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CodeTournamentHome } from "@/components/platform/CodeTournamentHome";
import { useAppProfileId } from "@/lib/app/useAppProfileId";

/** App → a code tournament (/tournaments/code/?id=…), as the signed-in player. */
function AppCodeTournament() {
  const id = useSearchParams().get("id") ?? "";
  const me = useAppProfileId();
  if (!id || me === "guest") return null;
  return <CodeTournamentHome id={id} meId={me} />;
}

export default function AppCodeTournamentPage() {
  return <Suspense><AppCodeTournament /></Suspense>;
}
