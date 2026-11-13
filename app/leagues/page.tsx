import type { Metadata } from "next";
import { LeaguesHome } from "@/components/platform/Leagues";

export const metadata: Metadata = { title: "Leagues | The Maroon", robots: { index: false } };

/** The Leagues tab (replaces Pick'ems): my leagues, Create a league, Join with a code. */
export default function LeaguesPage() {
  return <LeaguesHome />;
}
