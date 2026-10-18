"use client";

import Link from "next/link";
import { useState } from "react";
import { deletionSummary, resultMessage, tripOutcomeText, type DeletionCounts, type DeletionState, type HandoffState, type TripOutcome } from "@/lib/account/deletionCopy";
import settings from "./Settings.module.css";
import styles from "./DeleteAccount.module.css";

export type DeletionTrip = {
  tripId: string; name: string; startDate: string; endDate: string; ended: boolean; outcome: TripOutcome;
  handoff: { toName: string; state: HandoffState } | null; eligible: { memberId: string; name: string }[];
};
export type DeletionPreviewData = { trips: DeletionTrip[]; counts: DeletionCounts };

/** Dev preview only: answer locally instead of calling the server. */
export type DeletionActions = {
  refresh: () => Promise<DeletionPreviewData | null>;
  offer: (tripId: string, memberId: string) => Promise<string | null>;
  withdraw: (tripId: string) => Promise<string | null>;
  remove: (password: string) => Promise<{ state?: DeletionState; error?: string }>;
};

const serverActions: DeletionActions = {
  async refresh() {
    const response = await fetch("/api/account/delete", { cache: "no-store" });
    const body = await response.json().catch(() => null) as { preview?: DeletionPreviewData | null } | null;
    return body?.preview ?? null;
  },
  async offer(tripId, memberId) {
    const response = await fetch(`/api/golf-trips/${tripId}/organizer-handoff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId }) });
    const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    return response.ok && body?.ok ? null : body?.error ?? "That didn't send. Try again.";
  },
  async withdraw(tripId) {
    const response = await fetch(`/api/golf-trips/${tripId}/organizer-handoff`, { method: "DELETE" });
    return response.ok ? null : "That didn't save. Try again.";
  },
  async remove(password) {
    const response = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE", password }) });
    const body = await response.json().catch(() => null) as { ok?: boolean; state?: DeletionState; error?: string } | null;
    return response.ok && body?.ok && body.state ? { state: body.state } : { error: body?.error ?? "We couldn't delete your account. Try again." };
  },
};

const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * Settings → Account → Delete account. Shows exactly what happens (deleted / kept without your name / each trip you
 * organize), lets you ask a member to take over a trip (they must accept), then asks for your password and DELETE.
 * Shows "closed" until the server confirms every step; only "completed" says deleted.
 */
export function DeleteAccountFlow({ initial, actions = serverActions }: { initial: DeletionPreviewData; actions?: DeletionActions }) {
  const [preview, setPreview] = useState(initial);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [tripError, setTripError] = useState<Record<string, string>>({});
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"confirm" | "processing" | "done">("confirm");
  const [result, setResult] = useState<DeletionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = deletionSummary(preview.counts);

  async function tripAction(tripId: string, run: () => Promise<string | null>) {
    setBusyTrip(tripId);
    setTripError((e) => ({ ...e, [tripId]: "" }));
    const problem = await run().catch(() => "That didn't save. Try again.");
    if (problem) setTripError((e) => ({ ...e, [tripId]: problem }));
    else setPreview((await actions.refresh().catch(() => null)) ?? preview);
    setBusyTrip(null);
  }

  async function confirmDelete() {
    setPhase("processing");
    setError(null);
    const answer = await actions.remove(password).catch(() => ({ error: "We couldn't delete your account. Try again." }) as { state?: DeletionState; error?: string });
    if (answer.state) { setResult(answer.state); setPhase("done"); return; }
    setError(answer.error ?? "We couldn't delete your account. Try again.");
    setPhase("confirm");
  }

  if (phase === "done" && result) {
    const message = resultMessage(result);
    return <section className={settings.card} aria-live="polite">
      <div className={styles.status}>
        <span className={styles.pill}>{message.done ? "Deletion completed" : "Account closed · deletion finishing"}</span>
        <h2 className={styles.statusTitle}>{message.title}</h2>
        <p className={settings.text}>{message.body}</p>
        <Link href="/" className={settings.linkButton}>Go to the home page</Link>
      </div>
    </section>;
  }

  return <>
    <section aria-labelledby="delete-what" className={settings.card}>
      <h2 id="delete-what" className={settings.cardTitle}>What happens</h2>
      <p className={settings.text}>Deleting your account is permanent. It can&apos;t be undone, and signing up again later starts a brand-new account.</p>
      <p className={styles.subhead}>Deleted</p>
      <ul className={styles.list}>{summary.deleted.map((line) => <li key={line}>{line}</li>)}</ul>
      {summary.kept.length > 0 && <>
        <p className={styles.subhead}>Kept, without your name</p>
        <ul className={styles.list}>{summary.kept.map((line) => <li key={line}>{line}</li>)}</ul>
      </>}
    </section>

    {preview.trips.length > 0 && <section aria-labelledby="delete-trips" className={settings.card}>
      <h2 id="delete-trips" className={settings.cardTitle}>Trips you organize</h2>
      {preview.trips.map((trip) => {
        const canAsk = !trip.ended && trip.outcome !== "transfer";
        const pending = trip.handoff?.state === "pending" || trip.handoff?.state === "accepted";
        return <div key={trip.tripId} className={styles.trip}>
          <p className={styles.tripName}>{trip.name} <span className={styles.tripDates}>· {date(trip.startDate)} – {date(trip.endDate)}</span></p>
          <p className={styles.outcome}>{tripOutcomeText(trip)}</p>
          {canAsk && (trip.eligible.length > 0
            ? <div className={styles.row}>
              <label className="sr-only" htmlFor={`successor-${trip.tripId}`}>Ask a member to take over {trip.name}</label>
              <select id={`successor-${trip.tripId}`} className={styles.select} value={choice[trip.tripId] ?? ""} disabled={busyTrip === trip.tripId}
                onChange={(event) => setChoice((c) => ({ ...c, [trip.tripId]: event.target.value }))}>
                <option value="">Ask someone to take over…</option>
                {trip.eligible.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}
              </select>
              <button type="button" className={settings.secondary} disabled={!choice[trip.tripId] || busyTrip === trip.tripId}
                onClick={() => tripAction(trip.tripId, () => actions.offer(trip.tripId, choice[trip.tripId]))}>Ask</button>
            </div>
            : <p className={settings.note}>Nobody on this trip can take over yet: members need to have joined and finished their profile.</p>)}
          {pending && trip.handoff?.state === "pending" && <div className={styles.row}>
            <button type="button" className={settings.secondary} disabled={busyTrip === trip.tripId} onClick={() => tripAction(trip.tripId, () => actions.withdraw(trip.tripId))}>Withdraw request</button>
          </div>}
          {tripError[trip.tripId] && <p className={settings.error} role="alert">{tripError[trip.tripId]}</p>}
        </div>;
      })}
    </section>}

    <section aria-labelledby="delete-confirm" className={settings.card}>
      <h2 id="delete-confirm" className={settings.cardTitle}>Delete account</h2>
      <p className={settings.text}>To confirm it&apos;s you, enter your password and type <strong>DELETE</strong>.</p>
      <label className={styles.label}>Password
        <input className={styles.input} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={phase === "processing"} />
      </label>
      <label className={styles.label}>Type DELETE
        <input className={styles.input} autoCapitalize="characters" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} disabled={phase === "processing"} />
      </label>
      {error && <p className={settings.error} role="alert">{error}</p>}
      <button type="button" className={styles.danger} disabled={phase === "processing" || !password || typed.trim() !== "DELETE"} onClick={confirmDelete}>
        {phase === "processing" ? "Deleting your account… keep this page open" : "Delete my account"}
      </button>
    </section>
  </>;
}
