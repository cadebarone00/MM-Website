"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlayRound } from "@/components/platform/PlayRound";

/** App → Play a round (signed in only, which the app already requires). `?round=` reopens a round in progress. */
function AppPlayRound() {
  const params = useSearchParams();
  return <PlayRound openRound={params.get("round") ?? undefined} resume={params.get("resume") === "1"} />;
}

export default function AppPlayRoundPage() {
  return <Suspense><AppPlayRound /></Suspense>;
}
