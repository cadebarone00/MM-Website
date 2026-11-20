import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentDataPreview } from "./TournamentDataPreview";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { devTripPreview } from "@/lib/dev/devTripPreview";

export const metadata: Metadata = { title: "Golf Trip preview | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of Golf Trip Home (/golf-trips/trip) as if the questionnaire were finished, using
 * fixture answers. No login, no database. 404 unless NODE_ENV=development (`npm run dev`).
 * Accepts ?format=singles | fourball | foursome | bestball | scramble | shamble | chapman | stableford | singlesstroke | custom to preview format templates.
 */
export default async function GolfTripPreviewPage({ searchParams }: { searchParams?: Promise<{ format?: string; simulator?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const { mock, maroon, unmapped } = devTripPreview((params?.format ?? "singles").toLowerCase());

  // The signed-in account's name (so the Golf tab knows who "you" are); none when signed out.
  const current = await getCurrentProfile().catch(() => ({ status: "signed-out" as const }));
  const signedInName = current.status === "ok" ? current.profile.displayName : current.status === "incomplete" ? current.displayName : null;
  return <TournamentDataPreview embedded={params?.simulator === "1"} mock={mock} maroon={maroon} unmapped={unmapped} signedInName={signedInName} />;
}
