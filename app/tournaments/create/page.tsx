import type { Metadata } from "next";
import { CreateTournamentPage } from "@/components/platform/CreateTournamentPage";

export const metadata: Metadata = { title: "Create a Tournament | The Maroon" };

/** Create Tournament: pick a format tier, then the survey (/tournaments/new) opens. */
export default function CreatePage() {
  return <CreateTournamentPage />;
}
