import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevLeaguePreview } from "@/components/dev/DevLeaguePreview";

export const metadata: Metadata = { title: "League preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: a sample league (no sign-in, nothing saved), Stage 1 of Leagues (project_specs.md "Feature: Leagues"). */
export default function DevLeaguesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevLeaguePreview />;
}
