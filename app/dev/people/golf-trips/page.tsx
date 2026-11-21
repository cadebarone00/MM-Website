import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockGolfTrips } from "@/components/dev/MockPeoplePreview";

export const metadata: Metadata = { title: "Mock people · Golf Trips | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the Golf Trips tab for one of the 5 pretend people (lib/dev/mockPeople.ts). Nothing is saved. */
export default function MockPeopleGolfTripsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MockGolfTrips />;
}