import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveEventPage } from "@/components/tap-in/LiveEventPage";
import { tapInPath } from "@/lib/platform/tapIn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Maroon Live", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Public, read-only trip/tournament/league access through the existing watch-code boundary. Computers and TVs get the
 *  TV board, phones today's live page (LiveEventPage, Desktop = TV 2026-11-23). */
export default async function TripTapInPage({ params }: { params: Promise<{ code: string }> }) {
  const path = tapInPath((await params).code);
  if (!path) notFound();
  return <LiveEventPage code={path.slice(path.lastIndexOf("/") + 1)} />;
}
