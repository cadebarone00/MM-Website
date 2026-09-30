"use client";

import { useState } from "react";
import type { AccessRequestForReview } from "@/lib/platform/accessRequests";
import styles from "./AccessRequests.module.css";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

function RequestCard({ request, busy, onReview }: { request: AccessRequestForReview; busy: boolean; onReview: (decision: "approved" | "denied", note: string) => void }) {
  const [note, setNote] = useState("");
  const label = `request #${request.reference}`;
  return <li className={styles.card} data-request={request.reference} data-status={request.status}>
    <div className={styles.requestTop}>
      <h3>{request.groupName} <span>#{request.reference}</span></h3>
      <span className={styles.badge} data-status={request.status}>{request.status === "pending" ? "Pending" : request.status === "approved" ? "Approved" : "Denied"}</span>
    </div>
    <dl className={styles.summary}>
      <div><dt>Requested by</dt><dd>{request.requesterName} · {request.email}</dd></div>
      <div><dt>Year · players</dt><dd>{request.seasonYear} · about {request.expectedPlayers}</dd></div>
      {request.destination && <div><dt>Location</dt><dd>{request.destination}</dd></div>}
      {request.note && <div><dt>About the tournament</dt><dd>{request.note}</dd></div>}
      <div><dt>Received</dt><dd>{when(request.createdAt)}</dd></div>
      {request.status !== "pending" && <div><dt>Reviewed</dt><dd>{when(request.reviewedAt)}{request.reviewedBy ? ` by ${request.reviewedBy}` : ""}{request.decisionNote ? ` — “${request.decisionNote}”` : ""}</dd></div>}
    </dl>
    {request.status === "pending" && <div className={styles.review}>
      <label className={styles.field}><span>Decision note (shown to the requester, optional)</span>
        <textarea value={note} maxLength={500} rows={2} onChange={(event) => setNote(event.target.value)} aria-label={`Decision note for ${label}`} />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => onReview("approved", note)} aria-label={`Approve ${label}`}>Approve</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => onReview("denied", note)} aria-label={`Deny ${label}`}>Deny</button>
      </div>
    </div>}
  </li>;
}

/** Platform admin review of beta creator-access requests. Approving grants creator access; denying changes nothing else. */
export function AccessReviewList({ initialRequests }: { initialRequests: AccessRequestForReview[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function review(reference: number, decision: "approved" | "denied", note: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/access-requests/review", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, decision, note }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) { setMessage(result.error ?? "Could not save the decision. Try again."); return; }
      setRequests(result.requests);
      setMessage(`Request #${reference} ${decision === "approved" ? "approved — they can create tournaments now" : "denied"}.`);
    } catch {
      setMessage("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");
  return <>
    <p className={styles.status} role="status" aria-live="polite">{message}</p>
    <section className={styles.group} aria-labelledby="pending-title">
      <h2 id="pending-title">Pending ({pending.length})</h2>
      {pending.length === 0 ? <p className={styles.muted}>No requests waiting.</p>
        : <ul className={styles.list}>{pending.map((request) => <RequestCard key={request.reference} request={request} busy={busy} onReview={(decision, note) => review(request.reference, decision, note)} />)}</ul>}
    </section>
    {reviewed.length > 0 && <section className={styles.group} aria-labelledby="reviewed-title">
      <h2 id="reviewed-title">Reviewed</h2>
      <ul className={styles.list}>{reviewed.map((request) => <RequestCard key={request.reference} request={request} busy onReview={() => {}} />)}</ul>
    </section>}
  </>;
}
