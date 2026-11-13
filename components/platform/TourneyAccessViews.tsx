import { OrganizerStudioShell } from "./OrganizerStudioShell";
import { RequestAccessPanel } from "./RequestAccessPanel";
import { CreatorAccessNotice } from "./CreatorAccessNotice";
import { TournamentDraftWorkspace } from "@/components/tournament-draft/TournamentDraftWorkspace";
import { requestYears } from "@/lib/platform/accessRequests";
import type { MyAccessResult } from "@/lib/platform/accessRequestsServer";
import type { CreateTier } from "@/lib/platform/createTiers";
import styles from "./AccessRequests.module.css";

/** Request tournament-creator access (signed in). Shared by the website's page and the iPhone / Android app's. */
export function RequestAccessView({ result }: { result: Extract<MyAccessResult, { signedIn: true }> }) {
  return <OrganizerStudioShell page="request">
    <main className={styles.page}>
      <h1>Tournament creator access</h1>
      <p>The Maroon is in beta. Tournament creation opens to approved organizers first.</p>
      {result.ok ? <RequestAccessPanel initialAccess={result.access} name={result.name} email={result.email} years={requestYears()} />
        : <p className={styles.errors} role="alert">We couldn&apos;t load your access status right now. Refresh the page to try again.</p>}
    </main>
  </OrganizerStudioShell>;
}

/** New tournament (the organizer studio's draft workspace). Shared by the website's page and the app's. */
export function NewTournamentView({ tier, result }: { tier: CreateTier | null; result: MyAccessResult }) {
  return <OrganizerStudioShell page="create">
    {tier && <p data-create-tier className="mx-auto mb-3 max-w-[960px] px-5 pt-4 font-condensed text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">{tier.name} · {tier.price}</p>}
    <CreatorAccessNotice signedIn={result.signedIn} access={result.signedIn && result.ok ? result.access : null} />
    <TournamentDraftWorkspace />
  </OrganizerStudioShell>;
}
