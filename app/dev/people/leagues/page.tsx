import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockLeagues } from "@/components/dev/MockPeoplePreview";

export const metadata: Metadata = { title: "Mock people · Leagues | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the Leagues tab for one of the 5 pretend people (lib/dev/mockPeople.ts). Nothing is saved. */
export default function MockPeopleLeaguesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MockLeagues />;
}