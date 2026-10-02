import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfTripSettingsPreview } from "@/components/platform/GolfTripSettingsPreview";

export const metadata: Metadata = { title: "Trip Settings preview | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of the screenshot-inspired static Settings layout.
 * No login, no database. 404 unless NODE_ENV=development (`npm run dev`).
 */
export default function GolfTripSettingsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GolfTripSettingsPreview />;
}
