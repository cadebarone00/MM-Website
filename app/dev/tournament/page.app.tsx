"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TournamentDataPreview } from "./TournamentDataPreview";
import { devTripPreview } from "@/lib/dev/devTripPreview";

/**
 * App → the example Golf Trip (dev server only, `npm run dev:app`): the same sample trips as the website's
 * /dev/tournament, so the trip can be seen as it looks in the app. A TestFlight / App Store build never shows it.
 * Who "you" are on the Golf tab comes from the preview's own sample account.
 */
export default function DevTripAppPage() {
  return process.env.NODE_ENV === "development" ? <Suspense><Preview /></Suspense> : null;
}
function Preview() {
  const query = useSearchParams();
  const { mock, maroon, unmapped } = devTripPreview((query.get("format") ?? "singles").toLowerCase());
  return <TournamentDataPreview embedded={query.get("simulator") === "1"} mock={mock} maroon={maroon} unmapped={unmapped} />;
}
