import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessReviewList } from "@/components/platform/AccessReviewList";
import { OrganizerStudioShell } from "@/components/platform/OrganizerStudioShell";
import styles from "@/components/platform/AccessRequests.module.css";
import { loadRequestsForReview } from "@/lib/platform/accessRequestsServer";

export const metadata: Metadata = { title: "Tournament access requests | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Platform administration (not the founding tournament's Admin Center):
 * review beta creator-access requests. Platform admins only; everyone else
 * gets a plain 404.
 */
export default async function TournamentAccessAdminPage() {
  const result = await loadRequestsForReview();
  if (!result.signedIn) redirect("/login");
  if (!result.admin) notFound();
  return <OrganizerStudioShell page="admin">
    <main className={`${styles.page} ${styles.wide}`}>
      <h1>Tournament access requests</h1>
      <p>Approving gives the person creator access (tournament_creator_access). Denying changes nothing else. Decision notes are shown to the requester.</p>
      <AccessReviewList initialRequests={result.requests} />
    </main>
  </OrganizerStudioShell>;
}
