import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WatchPage } from "@/components/platform/WatchPage";
import { tapInPath } from "@/lib/platform/tapIn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tap In | The Maroon", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Public, read-only trip/tournament access through the existing watch-code boundary. */
export default async function TripTapInPage({ params }: { params: Promise<{ code: string }> }) {
  const path = tapInPath((await params).code);
  if (!path) notFound();
  return <WatchPage code={path.slice(path.lastIndexOf("/") + 1)} />;
}
