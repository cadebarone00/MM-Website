import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfTripSettings } from "@/components/platform/GolfTripSettings";

export const metadata: Metadata = { title: "Trip Settings preview | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of Trip Settings, seen as the organizer. Add `?as=traveler` to see what everyone else sees.
 * No login, no database. 404 unless NODE_ENV=development (`npm run dev`).
 */
export default async function GolfTripSettingsPreviewPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { as } = await searchParams;
  return <GolfTripSettings backHref="/dev/tournament" isOrganizer={as !== "traveler"} />;
}
