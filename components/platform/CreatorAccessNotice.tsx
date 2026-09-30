import Link from "next/link";
import { REQUEST_ACCESS_PATH, type MyAccess } from "@/lib/platform/accessRequests";
import styles from "./AccessRequests.module.css";

/**
 * Tells someone who can't create tournaments yet where they stand, with the
 * next step (request access, see the pending request, or contact us). Renders
 * nothing for anyone who can create.
 */
export function CreatorAccessNotice({ access, signedIn }: { access: MyAccess | null; signedIn: boolean }) {
  if (!signedIn) {
    return <aside className={styles.notice} aria-label="Creator access">
      <p><strong>Sign in to save tournaments.</strong> Creating tournaments is invite-only during the beta; sign in to request access.</p>
      <Link className={styles.secondary} href="/login">Sign in</Link>
    </aside>;
  }
  if (!access || access.canCreate) return null;
  const status = access.request?.status;
  return <aside className={styles.notice} aria-label="Creator access" data-state={status ?? "none"}>
    {status === "pending" ? <p><strong>Your access request is being reviewed.</strong> Creating tournaments stays unavailable until it&apos;s approved. You can still sketch a local draft.</p>
      : status === "denied" ? <p><strong>Your access request wasn&apos;t approved.</strong> Get in touch if you&apos;d like to talk about it.</p>
      : <p><strong>Creating tournaments is invite-only during the beta.</strong> Request access and we&apos;ll review it. You can still sketch a local draft.</p>}
    {status === "denied" ? <Link className={styles.secondary} href="/contact">Contact us</Link>
      : <Link className={styles.primary} href={REQUEST_ACCESS_PATH}>{status === "pending" ? "View request" : "Request access"}</Link>}
  </aside>;
}
