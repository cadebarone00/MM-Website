import type { Metadata } from "next";
import { LeagueJoinPage } from "@/components/platform/Leagues";

export const metadata: Metadata = { title: "Join a league | The Maroon", robots: { index: false } };

/** /leagues/join?code=…: from the Leagues tab's code box or a shared link. */
export default function JoinLeaguePage() {
  return <LeagueJoinPage />;
}
