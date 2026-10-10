"use client";

import { useState } from "react";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEV_ACCOUNTS } from "@/lib/dev/devAccounts";
import { DEV_TRIP_ID, scopedRoundId, type DevLiveCard, type DevRoundsAction } from "@/lib/dev/devPlayerRounds";
import { cardComplete, mismatchedHoles } from "@/lib/platform/liveCards";
import type { EditableField, PlayerRound, ShotResult } from "@/lib/platform/playerRounds";
import { swapAttester } from "@/lib/platform/roundGroups";
import type { PushChoice } from "@/lib/platform/scoreEdits";
import { roundRow } from "@/lib/platform/tripRoundState";
import notificationStyles from "./GolfTripNotifications.module.css";
import toggleStyles from "./GolfTripCompetition.module.css";

const message = (e: unknown) => e instanceof Error ? e.message : String(e);

/**
 * DEV ONLY (Player & Attest add-on): the trip organizer's score tools in Organizer settings → Player Scoring. Start / End
 * each round, change who attests whom, Allow push-through (off by default), push a stuck card through, and override a
 * submitted hole. Every change needs a reason and lands in the round's change log. Reads and writes the shared dev store.
 */
export function OrganizerScores({ roundNumbers, organizerId, scheduledToday = false, tripId=DEV_TRIP_ID }: { tripId?:string; roundNumbers: number[]; organizerId: string; scheduledToday?: boolean }) {
  const store = useDevPlayerRounds();
  const [error, setError] = useState<string | null>(null);
  const run = (action: DevRoundsAction) => { try { dispatchDevRounds(action); setError(null); return true; } catch (e) { setError(message(e)); return false; } };
  const nameOf = (id: string) => store.groups.filter(g=>g.tripId===tripId).flatMap((g) => Object.entries(g.names)).find(([key]) => key === id)?.[1] ?? DEV_ACCOUNTS.find((a) => a.id === id)?.name ?? id;
  const now = () => new Date().toISOString();
  const submitted = store.rounds.filter((r) => r.source === "trip" && r.tripId === tripId);
  const groups=store.groups.filter(g=>g.tripId===tripId);
  const allowPushThrough=tripId===DEV_TRIP_ID?store.allowPushThrough:store.allowPushThroughByTrip?.[tripId]??false;
  const stuck = store.liveCards.filter((c) => groups.some(g=>g.id===c.groupId) && cardComplete(c, c.meta.par) && mismatchedHoles(c).length > 0);

  return <>
    {error && <p role="alert" className={notificationStyles.categoryTitle}>{error}</p>}
    <section className={notificationStyles.category} aria-label="Rounds">
      <h2 className={notificationStyles.categoryTitle}>Rounds</h2>
      {roundNumbers.map((n) => {
        const row = roundRow(store.tripRounds[scopedRoundId(tripId,n)], scheduledToday);
        return <div key={n} className={notificationStyles.row}>
          <span className={notificationStyles.label}>Round {n} · {row.label}</span>
          <button type="button" className={toggleStyles.toggle} onClick={() => run({ type: "setTripRound", tripRoundId: scopedRoundId(tripId,n), state: row.next, at: now() })}>
            {row.next === "closed" ? "End round" : "Start round"}</button>
        </div>;
      })}
    </section>

    <section className={notificationStyles.category} aria-label="Attesters">
      <h2 className={notificationStyles.categoryTitle}>Who attests whom</h2>
      {groups.length === 0 && <p className={notificationStyles.label}>Groups show once a round is being scored.</p>}
      {groups.flatMap((group) => group.players.map((player) => {
        const locked = submitted.some((r) => r.profileId === player.profileId && r.groupId === group.id);
        return <div key={`${group.id}|${player.profileId}`} className={notificationStyles.row}>
          <span className={notificationStyles.label}>{nameOf(player.profileId)} — attested by</span>
          <select aria-label={`Attester for ${nameOf(player.profileId)}`} value={player.attesterProfileId ?? ""} disabled={locked || group.players.length < 2}
            onChange={(event) => { try { swapAttester(group.players, player.profileId, event.target.value); run({ type: "swapAttester", groupId: group.id, profileId: player.profileId, attesterProfileId: event.target.value }); } catch (e) { setError(message(e)); } }}>
            {group.players.filter((p) => p.profileId !== player.profileId).map((p) => <option key={p.profileId} value={p.profileId}>{nameOf(p.profileId)}</option>)}
          </select>
        </div>;
      }))}
    </section>

    <section className={notificationStyles.category} aria-label="Push-through">
      <h2 className={notificationStyles.categoryTitle}>Cards that can&rsquo;t be submitted</h2>
      <div className={notificationStyles.row}>
        <span className={notificationStyles.label}>Allow push-through</span>
        <button type="button" role="switch" aria-checked={allowPushThrough} aria-label="Allow push-through" className={toggleStyles.toggle}
          onClick={() => run({ type: "setAllowPushThrough", tripId:tripId===DEV_TRIP_ID?undefined:tripId, on: !allowPushThrough })}>
          <span className={toggleStyles.track} data-on={allowPushThrough}><span className={toggleStyles.thumb} /></span><span>{allowPushThrough ? "On" : "Off"}</span>
        </button>
      </div>
      {stuck.length === 0 ? <p className={notificationStyles.label}>No stuck cards.</p>
        : stuck.map((card) => <PushThroughCard key={`${card.groupId}|${card.profileId}`} card={card} name={nameOf(card.profileId)} allowed={allowPushThrough}
          onPush={(choices, reason) => run({ type: "pushThrough", groupId: card.groupId, profileId: card.profileId, choices, byProfileId: organizerId, at: now(), reason })} />)}
    </section>

    <section className={notificationStyles.category} aria-label="Submitted cards">
      <h2 className={notificationStyles.categoryTitle}>Submitted cards</h2>
      {submitted.length === 0 ? <p className={notificationStyles.label}>No submitted cards yet.</p>
        : submitted.map((round) => <OverrideCard key={round.id} round={round} name={nameOf(round.profileId)}
          onSave={(hole, field, to, reason) => run({ type: "overrideHole", roundId: round.id, input: { hole, field, to, byProfileId: organizerId, at: now(), reason } })} />)}
    </section>
  </>;
}

function PushThroughCard({ card, name, allowed, onPush }: { card: DevLiveCard; name: string; allowed: boolean; onPush: (choices: Record<number, PushChoice>, reason: string) => boolean }) {
  const [choices, setChoices] = useState<Record<number, PushChoice>>({});
  const [reason, setReason] = useState("");
  const holes = mismatchedHoles(card);
  return <div className={notificationStyles.row} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
    <span className={notificationStyles.label}>{name} · holes {holes.join(", ")} don&rsquo;t match</span>
    {holes.map((n) => { const h = card.holes[n - 1]; return <div key={n} role="group" aria-label={`Hole ${n}`} style={{ display: "flex", gap: 8 }}>
      <span>Hole {n}</span>
      {(["player", "attester"] as const).map((who) => <button key={who} type="button" aria-pressed={choices[n] === who} onClick={() => setChoices({ ...choices, [n]: who })}>
        {who === "player" ? `Player: ${h.strokes ?? "—"}` : `Attester: ${h.attestStrokes ?? "—"}`}</button>)}
    </div>; })}
    <input aria-label={`Reason for ${name}'s push-through`} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
    <button type="button" disabled={!allowed || holes.some((n) => !choices[n]) || !reason.trim()} onClick={() => { if (onPush(choices, reason)) { setChoices({}); setReason(""); } }}>Push through</button>
  </div>;
}

function OverrideCard({ round, name, onSave }: { round: PlayerRound; name: string; onSave: (hole: number, field: EditableField, to: number | ShotResult | null, reason: string) => boolean }) {
  const [hole, setHole] = useState(1);
  const [field, setField] = useState<EditableField>("strokes");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const numeric = field === "strokes" || field === "putts";
  const parsed: number | ShotResult | null = value === "" ? null : numeric ? Number(value) : value as ShotResult;
  return <details className={notificationStyles.row} style={{ display: "block" }}>
    <summary>{name} · {round.total}{round.edits?.length ? ` · ${round.edits.length} change${round.edits.length === 1 ? "" : "s"}` : ""}</summary>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      <select aria-label="Hole" value={hole} onChange={(e) => setHole(Number(e.target.value))}>{round.holes.map((h) => <option key={h.number} value={h.number}>Hole {h.number} (now {h.strokes})</option>)}</select>
      <select aria-label="What to change" value={field} onChange={(e) => { setField(e.target.value as EditableField); setValue(""); }}>
        {(["strokes", "putts", "fairway", "green"] as const).map((f) => <option key={f} value={f}>{f}</option>)}</select>
      {numeric
        ? <input aria-label="New value" type="number" min={field === "strokes" ? 1 : 0} max={field === "strokes" ? 20 : 10} value={value} onChange={(e) => setValue(e.target.value)} />
        : <select aria-label="New value" value={value} onChange={(e) => setValue(e.target.value)}><option value="">—</option>{(["center", "left", "right", "up", "down"] as const).map((s) => <option key={s} value={s}>{s === "center" ? "hit" : s}</option>)}</select>}
      <input aria-label={`Reason for changing ${name}'s card`} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" disabled={!reason.trim() || (field === "strokes" && parsed === null)} onClick={() => { if (onSave(hole, field, parsed, reason)) { setValue(""); setReason(""); } }}>Save change</button>
    </div>
  </details>;
}
