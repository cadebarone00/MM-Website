import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockPlay } from "@/components/dev/MockPeoplePreview";

export const metadata: Metadata = { title: "Mock people · Play | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the Play tab for one of the 5 pretend people (lib/dev/mockPeople.ts). Nothing is saved. */
export default function MockPeoplePlayPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MockPlay />;
}