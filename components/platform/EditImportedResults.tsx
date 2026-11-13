"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { HoleParsEditor, ScoreRound } from "./ImportWalkthrough";
import { draftFromTrip, ownBall, type ImportedTrip, type ResultChanges, type TripDraft } from "@/lib/platform/pastTripModel";
import sheet from "./PastTripImport.module.css";
import styles from "./ImportWalkthrough.module.css";

export interface ImportedEditing { imported: ImportedTrip; revision: number; memberId: string; organizer: boolean; endpoint: string }
/** Two per-hole lists are the same (a missing list and an all-blank one count as the same). */
const same18 = (a: unknown[] | null | undefined, b: unknown[] | null | undefined) => JSON.stringify(a?.some((x) => x !== null) ? a : null) === JSON.stringify(b?.some((x) => x !== null) ? b : null);

/** What changed between the saved trip and the edited draft, as the server expects it. */
function changesBetween(trip: ImportedTrip, draft: TripDraft): ResultChanges {
  const key = (round: number, player: string) => `${round}:${player}`;
  const before = new Map(trip.scores.map((s) => [key(s.round, s.player), s]));
  const after = new Map(draft.scores.map((s) => [key(s.round, s.player), s]));
  const scores: ResultChanges["scores"] = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(k), a = after.get(k);
    if (b && a && b.total === a.total && same18(b.holes, a.holes) && same18(b.putts, a.putts) && same18(b.fairway, a.fairway) && same18(b.green, a.green)) continue;
    const [round, player] = [Number(k.split(":")[0]), k.slice(k.indexOf(":") + 1)];
    scores.push({ round, player, total: a?.total ?? null, holes: a?.holes ?? null, putts: a?.putts ?? null, fairway: a?.fairway ?? null, green: a?.green ?? null });
  }
  const matches = draft.matches.flatMap((m, index) => m.winner !== null && m.winner !== trip.matches[index]?.winner ? [{ index, winner: m.winner }] : []);
  const pars = draft.rounds.flatMap((r) => {
    const before = trip.rounds.find((x) => x.number === r.number)?.holePars;
    return r.holePars && !same18(before, r.holePars) ? [{ round: r.number, holePars: r.holePars }] : [];
  });
  return { scores, matches, pars };
}

/**
 * Imported trip → Edit my scores (a player whose account is linked to their name) or Edit results (the organizer: every
 * score and match winner). Same score screen as the walkthrough; saved through the imported-results route, which checks
 * everything again. Players, rounds and formats aren't edited here: delete the trip and import it again for those.
 */
export function EditImportedResults({ editing }: { editing: ImportedEditing }) {
  const router = useRouter();
  const { organizer, memberId } = editing;
  // The latest saved results: what the page was given, or newer from this phone's last save (until the page catches up).
  const [latest, setLatest] = useState({ trip: editing.imported, revision: editing.revision });
  if (editing.revision > latest.revision) setLatest({ trip: editing.imported, revision: editing.revision });
  const trip = latest.trip;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFromTrip(trip));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const playing = trip.players.some((p) => p.id === memberId);
  const scoreRounds = trip.kind === "team" ? [] : trip.rounds.filter((r) => ownBall(r.format));
  if (!organizer && !(playing && scoreRounds.length)) return null;
  const update = (change: (d: TripDraft) => void) => setDraft((d) => { const next = structuredClone(d); change(next); return next; });
  const name = (id: string) => trip.players.find((p) => p.id === id)?.name ?? "?";
  const sideName = (ids: string[]) => ids.map(name).join(" & ");
  const teamLabel = (s: 0 | 1) => trip.teamNames?.[s] ?? `Player ${s + 1}`;

  async function save() {
    const changes = changesBetween(trip, draft);
    if (!changes.scores.length && !changes.matches.length && !changes.pars?.length) { setOpen(false); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(editing.endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: latest.revision, changes }) });
      const reply = await response.json().catch(() => ({ ok: false, error: "Something went wrong. Try again." }));
      if (reply.ok) { setLatest({ trip: reply.results, revision: reply.revision }); setOpen(false); router.refresh(); }
      else setError(reply.error ?? "We couldn't save that. Try again.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return <>
    <button type="button" className={sheet.open} onClick={() => { setDraft(draftFromTrip(trip)); setError(""); setOpen(true); }}>{organizer ? "Edit results" : "Edit my scores"}</button>
    {open && <GolfTripActionSheet label={organizer ? "Edit results" : "Edit my scores"} onClose={() => { if (!busy) setOpen(false); }}>
      <div className={sheet.body}>
        <h2 className={sheet.title}>{organizer ? "Edit results" : "Edit my scores"}</h2>
        {organizer && trip.matches.length > 0 && <section className={styles.card} aria-label="Match winners">
          <div className={styles.cardHead}><h2>Matches</h2></div>
          {draft.matches.map((m, i) => <div key={m.id} className={styles.match}>
            <span className={styles.sideLabel}>Round {m.round}: {sideName(m.sides[0])} vs {sideName(m.sides[1])}</span>
            <div className={styles.winner} role="group" aria-label={`Round ${m.round} match ${i + 1} winner`}>
              {([0, "halved", 1] as const).map((w) => <button key={String(w)} type="button" aria-pressed={m.winner === w} onClick={() => update((d) => { d.matches[i].winner = w; })}>
                {w === "halved" ? "Halved" : trip.kind === "individual" ? sideName(m.sides[w]) : teamLabel(w)}</button>)}
            </div>
          </div>)}
        </section>}
        {organizer && scoreRounds.length > 0 && <section className={styles.card} aria-label="Hole pars">
          <div className={styles.cardHead}><h2>Hole pars</h2></div>
          <p className={styles.hint}>Needed for hole-by-hole stats. Picking a course when importing fills these in.</p>
          {draft.rounds.filter((r) => r.format && ownBall(r.format)).map((r) => <div key={r.number}>
            <span className={styles.sideLabel}>Round {r.number} · {r.course}</span>
            <HoleParsEditor label={`Round ${r.number}`} holePars={r.holePars} onChange={(pars) => update((d) => { const x = d.rounds.find((y) => y.number === r.number); if (x) x.holePars = pars; })} />
          </div>)}
        </section>}
        {scoreRounds.map((r) => <ScoreRound key={r.number} round={r.number} format={r.format} par={r.par} holePars={draft.rounds.find((x) => x.number === r.number)?.holePars}
          players={draft.players.filter((p) => organizer || p.id === memberId)} draft={draft} update={update} />)}
        {error && <p className={sheet.error} role="alert">{error}</p>}
        <button type="button" className={sheet.primary} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </GolfTripActionSheet>}
  </>;
}
