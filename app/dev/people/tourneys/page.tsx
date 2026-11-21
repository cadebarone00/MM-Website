import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockTourneys } from "@/components/dev/MockPeoplePreview";

export const metadata: Metadata = { title: "Mock people · Tourneys | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the Tourneys tab for one of the 5 pretend people (lib/dev/mockPeople.ts). Nothing is saved. */
export default function MockPeopleTourneysPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MockTourneys />;
}