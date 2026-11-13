"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlayRound } from "@/components/platform/PlayRound";

/** App → Play a round (signed in only, which the app already requires). `?round=` reopens a round in progress. */
function AppPlayRound() {
  return <PlayRound openRound={useSearchParams().get("round") ?? undefined} />;
}

export default function AppPlayRoundPage() {
  return <Suspense><AppPlayRound /></Suspense>;
}
