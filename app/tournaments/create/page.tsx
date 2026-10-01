import type { Metadata } from "next";
import { CreateTournamentPage } from "@/components/platform/CreateTournamentPage";

export const metadata: Metadata = { title: "Create a Tournament | The Maroon" };

/** Create Tournament: setup page 1, pick what you're creating (event, team, league, group). */
export default function CreatePage() {
  return <CreateTournamentPage />;
}
