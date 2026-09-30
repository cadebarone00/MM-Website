import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrganizerStudioShell } from "@/components/platform/OrganizerStudioShell";
import { RequestAccessPanel } from "@/components/platform/RequestAccessPanel";
import styles from "@/components/platform/AccessRequests.module.css";
import { requestYears } from "@/lib/platform/accessRequests";
import { loadMyAccess } from "@/lib/platform/accessRequestsServer";

export const metadata: Metadata = { title: "Request access | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Beta creator access: request it, or see where your request stands. Signed-in only. */
export default async function RequestAccessPage() {
  const result = await loadMyAccess();
  if (!result.signedIn) redirect("/login");
  return <OrganizerStudioShell page="request">
    <main className={styles.page}>
      <h1>Tournament creator access</h1>
      <p>The Maroon is in beta. Tournament creation opens to approved organizers first.</p>
      {result.ok ? <RequestAccessPanel initialAccess={result.access} name={result.name} email={result.email} years={requestYears()} />
        : <p className={styles.errors} role="alert">We couldn&apos;t load your access status right now. Refresh the page to try again.</p>}
    </main>
  </OrganizerStudioShell>;
}
