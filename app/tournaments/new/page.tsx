import type { Metadata } from "next";
import { CreatorAccessNotice } from "@/components/platform/CreatorAccessNotice";
import { OrganizerStudioShell } from "@/components/platform/OrganizerStudioShell";
import { loadMyAccess } from "@/lib/platform/accessRequestsServer";
import { TournamentDraftWorkspace } from "@/components/tournament-draft/TournamentDraftWorkspace";

export const metadata: Metadata = { title: "Create a tournament | The Maroon", description: "Plan your tournament with a quick draft and a guided setup checklist." };

export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  // Anyone may sketch a local draft; people who can't save yet are told why and where to request access.
  const result = await loadMyAccess();
  return <OrganizerStudioShell page="create">
    <CreatorAccessNotice signedIn={result.signedIn} access={result.signedIn && result.ok ? result.access : null} />
    <TournamentDraftWorkspace />
  </OrganizerStudioShell>;
}
