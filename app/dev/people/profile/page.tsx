import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockProfile } from "@/components/dev/MockPeoplePreview";

export const metadata: Metadata = { title: "Mock people · Profile | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: their own Profile for one of the 5 pretend people (lib/dev/mockPeople.ts). Nothing is saved. */
export default function MockPeopleProfilePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MockProfile />;
}