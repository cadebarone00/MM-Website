import type { Metadata } from "next";
import { LeagueCreate } from "@/components/platform/Leagues";

export const metadata: Metadata = { title: "Create a league | The Maroon", robots: { index: false } };

export default function NewLeaguePage() {
  return <LeagueCreate />;
}
