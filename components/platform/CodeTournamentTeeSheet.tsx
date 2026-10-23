"use client";

import { useState } from "react";
import { ArrowDownWideNarrow, Shuffle } from "lucide-react";
import { GolfTeeSheet } from "./GolfTripMatch";
import { Wheel } from "./Wheel";
import { DEFAULT_TIMING, randomTeeSheet, roundTeeSheet, scoreTeeSheet, teeSlot, teeTimeLabel, type CodeTournament, type TeeSheet, type TeeTiming } from "@/lib/platform/codeTournaments";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import styles from "./CodeTournament.module.css";

const EVERY = [7, 8, 9, 10, 12, 15];

/** A tournament round's Tee Sheet tab: each group's tee time, starting hole and players (the organizer edits it in Settings). */
export function CodeTournamentTeeSheet({ t, round, match }: { t: CodeTournament; round: number; match: GolfMatchPreview }) {
  const golfer = (id: string) => match.leaderboard[t.players.findIndex((p) => p.profileId === id)]?.golfer;
  const groups = roundTeeSheet(t, round).groups.map((g) => ({ time: teeTimeLabel(g.time), hole: g.hole, golfers: g.players.map(golfer).filter((x) => x !== undefined) }));
  return <GolfTeeSheet match={match} groups={groups} />;
}

/**
 * Tournament Settings → Tee Sheet: set the first tee time, minutes between groups and 1 / 1 & 10 starts (re-times every
 * group), randomize the pairings or order them by score (worst first, leaders last), move a player to another group, and change any one group's time or hole. Save sends it
 * to everyone.
 */
export function TeeSheetEditor({ t, round, sheet, holes, onCancel, onSave }: { t: CodeTournament; round: number; sheet: TeeSheet; holes: number; onCancel: () => void; onSave: (sheet: TeeSheet) => Promise<void> }) {
  const [draft, setDraft] = useState(sheet);
  const [timing, setTiming] = useState<TeeTiming>(() => ({ ...DEFAULT_TIMING, first: sheet.groups[0]?.time || DEFAULT_TIMING.first, split: holes >= 18 && sheet.groups.some((g) => g.hole === 10) }));
  const [saving, setSaving] = useState(false);
  const ids = sheet.groups.flatMap((g) => g.players);
  const byScore = scoreTeeSheet(t, round, ids, timing, holes);
  const name = (id: string) => t.players.find((p) => p.profileId === id)?.name ?? "Player";
  // New timing: every group gets its slot in order (players stay put).
  const retime = (next: TeeTiming) => { setTiming(next); setDraft((d) => ({ groups: d.groups.map((g, i) => ({ ...g, ...teeSlot(i, next, holes) })) })); };
  const setGroup = (i: number, change: Partial<TeeSheet["groups"][number]>) => setDraft((d) => ({ groups: d.groups.map((g, k) => k === i ? { ...g, ...change } : g) }));
  // Move a player to group `to` (= groups.length: a new group at the next slot); a group left empty goes away.
  const move = (id: string, to: number) => setDraft((d) => {
    const groups = d.groups.map((g) => ({ ...g, players: g.players.filter((p) => p !== id) }));
    if (to >= groups.length) groups.push({ ...teeSlot(groups.length, timing, holes), players: [] });
    groups[to].players.push(id);
    return { groups: groups.filter((g) => g.players.length) };
  });

  return <section className={styles.teeEditor} aria-label="Edit tee sheet">
    <div className={styles.teeTiming}>
      <label className={styles.teeField}><span>First tee</span>
        <input type="time" value={timing.first} onChange={(e) => e.target.value && retime({ ...timing, first: e.target.value })} /></label>
      <div className={styles.teeField}><span>Every</span>
        <Wheel label="Minutes between tee times" itemWidth={72} items={EVERY.map((m) => `${m} min`)} index={Math.max(EVERY.indexOf(timing.every), 0)}
          onChange={(i) => retime({ ...timing, every: EVERY[i] })} /></div>
      {holes >= 18 && <div className={styles.teeField}><span>Start on</span>
        <Wheel label="Starting holes" itemWidth={112} items={["Hole 1", "Holes 1 & 10"]} index={timing.split ? 1 : 0}
          onChange={(i) => retime({ ...timing, split: i === 1 })} /></div>}
    </div>
    <div className={styles.organizer}>
      <button type="button" className={styles.organizerButton} onClick={() => setDraft(randomTeeSheet(ids, timing, holes))}><Shuffle size={14} aria-hidden="true" /> Randomize pairings</button>
      {/* Worst score off first, the leaders last; needs scores from an earlier round. */}
      <button type="button" className={styles.organizerButton} disabled={!byScore} onClick={() => byScore && setDraft(byScore)}><ArrowDownWideNarrow size={14} aria-hidden="true" /> By score</button>
    </div>
    <ol className={styles.teeGroups}>
      {draft.groups.map((g, i) => <li key={i} className={styles.teeGroup}>
        <div className={styles.teeGroupHead}>
          <b>Group {i + 1}</b>
          <input type="time" aria-label={`Group ${i + 1} tee time`} value={g.time} onChange={(e) => setGroup(i, { time: e.target.value })} />
        </div>
        <div className={styles.teeGroupWheel}><Wheel label={`Group ${i + 1} starting hole`} itemWidth={72} items={Array.from({ length: holes }, (_, h) => `Hole ${h + 1}`)} index={g.hole - 1}
          onChange={(h) => setGroup(i, { hole: h + 1 })} /></div>
        <ul className={styles.teePlayers}>
          {g.players.map((id) => <li key={id}><span>{name(id)}</span>
            <select aria-label={`Move ${name(id)}`} value={i} onChange={(e) => move(id, Number(e.target.value))}>
              {draft.groups.map((_, k) => <option key={k} value={k}>Group {k + 1}</option>)}
              <option value={draft.groups.length}>New group</option>
            </select></li>)}
        </ul>
      </li>)}
    </ol>
    <div className={styles.organizer}>
      <button type="button" className={styles.organizerButton} onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="button" className={`${styles.organizerButton} ${styles.teeSave}`} disabled={saving} onClick={async () => { setSaving(true); await onSave(draft); setSaving(false); }}>{saving ? "Saving…" : "Save tee sheet"}</button>
    </div>
  </section>;
}
