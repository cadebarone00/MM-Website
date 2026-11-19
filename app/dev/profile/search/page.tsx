import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevSearchPreview } from "@/components/dev/DevProfilePreview";

export const metadata: Metadata = { title: "Search preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the real Search page on sample golfers, no sign-in. The simulator's Search conditionals open it typed in. */
export default function DevSearchPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense><DevSearchPreview /></Suspense>;
}
