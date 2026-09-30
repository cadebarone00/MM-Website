import type { Metadata } from "next";
import { JoinTournamentPage } from "@/components/platform/JoinTournamentPage";

export const metadata: Metadata = { title: "Tournaments | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Where Join Tournament on the home screen leads: open a link, create, or revisit past tournaments. */
export default function JoinPage() {
  return <JoinTournamentPage />;
}
