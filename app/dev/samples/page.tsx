import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevSamples } from "@/components/dev/DevSamples";

export const metadata: Metadata = { title: "Samples | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: one sample of each way to play (Play, Golf Trip, Tourney, League). */
export default function DevSamplesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevSamples />;
}
