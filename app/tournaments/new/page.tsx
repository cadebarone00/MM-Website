import type { Metadata } from "next";
import { CreatorAccessNotice } from "@/components/platform/CreatorAccessNotice";
import { OrganizerStudioShell } from "@/components/platform/OrganizerStudioShell";
import { loadMyAccess } from "@/lib/platform/accessRequestsServer";
import { TournamentDraftWorkspace } from "@/components/tournament-draft/TournamentDraftWorkspace";
import { tierFromParam } from "@/lib/platform/createTiers";

export const metadata: Metadata = { title: "Create a tournament | The Maroon", description: "Plan your tournament with a quick draft and a guided setup checklist." };

export const dynamic = "force-dynamic";

export default async function NewTournamentPage({ searchParams }: { searchParams: Promise<{ tier?: string | string[] }> }) {
  // The format picked on /tournaments/create, shown as a small header over the survey.
  const tier = tierFromParam((await searchParams).tier);
  // Anyone may sketch a local draft; people who can't save yet are told why and where to request access.
  const result = await loadMyAccess();
  return <OrganizerStudioShell page="create">
    {tier && <p data-create-tier className="mx-auto mb-3 max-w-[960px] px-5 pt-4 font-condensed text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">{tier.name} · {tier.price}</p>}
    <CreatorAccessNotice signedIn={result.signedIn} access={result.signedIn && result.ok ? result.access : null} />
    <TournamentDraftWorkspace />
  </OrganizerStudioShell>;
}
