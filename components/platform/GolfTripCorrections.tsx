"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "./GolfTripHome";
import { DecideRow } from "./GolfTripScoring";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import { tripCorrectionListFromJson, type TripCorrectionList } from "@/lib/platform/tripCorrections";
import styles from "./GolfTripHome.module.css";
import scoringStyles from "./GolfTripScoring.module.css";

const STATUS = { pending: "Pending", approved: "Approved · card reopened", denied: "Denied", resubmitted: "Resubmitted" } as const;
const day = (date: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Trip Settings → Corrections (Player & Attest Step 6), on any day, for anyone on the trip (organizers who aren't playing
 * too). The database decides what each person sees (their own requests, the golfer they attest, or everything for the
 * organizer) and who may decide (canDecide). Shows: my played rounds' scorecards (each opens that round, on its own
 * date), the requests, Approve / Deny (deny asks why) only where canDecide is true.
 */
export function GolfTripCorrections({ tripId, profileId }: { tripId: string; profileId: string }) {
  const [list, setList] = useState<TripCorrectionList | null | "unavailable">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchList = (id: string) => fetch(`/api/golf-trips/${id}/scoring/corrections?scope=trip`, { cache: "no-store" })
    .then(async (response) => { const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      return response.ok && body.ok ? tripCorrectionListFromJson(body.corrections) ?? "unavailable" as const : "unavailable" as const; })
    .catch(() => "unavailable" as const);
  const load = async () => setList(await fetchList(tripId));
  useEffect(() => {
    let current = true;
    void fetchList(tripId).then((next) => { if (current) setList(next); });
    return () => { current = false; };
  }, [tripId]);

  async function decide(requestId: string, approve: boolean, note: string | null) {
    setBusy(requestId); setError(null);
    try {
      const response = await fetch(`/api/golf-trips/${tripId}/scoring/corrections`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", requestId, approve, note, expectedProfileId: profileId }) });
      const answer = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || !answer.ok) setError(String(answer.error ?? "Couldn't save the decision."));
      await load();
      return response.ok && Boolean(answer.ok);
    } catch {
      setError("You're offline. Try again when you're back online.");
      return false;
    } finally { setBusy(null); }
  }

  if (list === null) return <Card title="Corrections"><p className={styles.settingsNote}>Loading…</p></Card>;
  if (list === "unavailable") return <Card title="Corrections"><p className={styles.settingsNote}>Corrections aren&apos;t available yet.</p></Card>;
  const roundUrl = (n: number) => `${golfTripUrl(tripId)}?round=${n}`;
  const myCards = list.rounds.filter((r) => r.played && r.mySubmitted);
  const pending = list.requests.filter((r) => r.status === "pending");
  const decided = list.requests.filter((r) => r.status !== "pending");
  const line = (r: TripCorrectionList["requests"][number]) => `${r.golferName} · Round ${r.roundNumber} (${day(r.playDate)}) · hole ${r.holes.join(", ")} · ${r.reason}`;

  return <>
    <Card title="My scorecards">
      {myCards.length === 0 ? <p className={styles.settingsNote}>No submitted scorecards yet.</p>
        : <ul className={scoringStyles.corrections}>{myCards.map((r) => <li key={r.roundNumber}>
          <Link href={roundUrl(r.roundNumber)}>Round {r.roundNumber} · {day(r.playDate)}{r.courseName ? ` · ${r.courseName}` : ""}{r.myReopened ? " · reopened" : ""}</Link>
        </li>)}</ul>}
      <p className={styles.settingsNote}>Open a scorecard, then Card → Request Correction.</p>
    </Card>
    <Card title="Correction requests">
      {pending.length === 0 && <p className={styles.settingsNote}>No pending requests.</p>}
      {pending.map((r) => <div key={r.id} className={scoringStyles.corrections}>
        <p className={scoringStyles.syncStatus} data-state="saved">Requested {when(r.requestedAt)}</p>
        {r.canDecide
          ? <DecideRow label={line(r)} busy={busy === r.id} onApprove={() => decide(r.id, true, null)} onDeny={(note) => decide(r.id, false, note)} />
          : <p className={styles.settingsNote}>{line(r)} · {r.golferProfileId === profileId ? "waiting for a decision" : "pending"}</p>}
      </div>)}
      {error && <p className={scoringStyles.syncStatus} data-state="conflict" role="alert">{error}</p>}
      {decided.length > 0 && <details className={scoringStyles.history}>
        <summary>Decided requests</summary>
        <ol>{decided.map((r) => <li key={r.id}>{line(r)} · {STATUS[r.status]}{r.decidedByName ? ` by ${r.decidedByName}` : ""}{r.decidedAt ? ` · ${when(r.decidedAt)}` : ""}
          {r.status === "denied" && r.decisionNote ? ` · Reason: ${r.decisionNote}` : ""}
          {r.status === "approved" && <> · <Link href={roundUrl(r.roundNumber)}>Open round {r.roundNumber}</Link></>}</li>)}</ol>
      </details>}
    </Card>
  </>;
}
