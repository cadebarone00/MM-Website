import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyUiBrowser } from "@/components/dev/LegacyUiBrowser";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "V1 UI review | The Maroon",
  robots: { index: false, follow: false },
};

export default async function LegacyDevelopmentPage({ searchParams }: { searchParams: Promise<{ screen?: string | string[]; viewport?: string | string[] }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const selection = await searchParams;
  return <LegacyUiBrowser requestedScreen={selection.screen} requestedViewport={selection.viewport} />;
}
