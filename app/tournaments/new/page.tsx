import type { Metadata } from "next";
import { TournamentDraftWorkspace } from "@/components/tournament-draft/TournamentDraftWorkspace";

export const metadata: Metadata = { title: "Create a tournament | The Maroon", description: "Plan your tournament with a quick draft and a guided setup checklist." };

export default function NewTournamentPage() {
  return <TournamentDraftWorkspace />;
}
