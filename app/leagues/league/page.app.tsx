"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LeagueHome } from "@/components/platform/LeagueHome";

/** App → a league (?id=), the website's /leagues/<id> (lib/app/appPaths.ts converts the address). */
export default function AppLeaguePage() {
  return <Suspense><League /></Suspense>;
}
function League() {
  const id = useSearchParams().get("id") ?? "";
  return <LeagueHome key={id} id={id} />;
}
