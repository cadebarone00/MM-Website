"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { CheckCircle2, Circle, FastForward, Play, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { draftBoardFor } from "@/lib/platform/teamDraftPicks";
import {
  MOCK_DRAFT_PRESETS, mockChecks, mockInstruction, mockPick, mockStart, mockTurn, mockViewerLabel, mockViewers, newMockDraft, readMockDraft,
  subscribeMockDraft, writeMockDraft, type MockDraftPresetId, type MockDraftStore, type MockViewer,
} from "@/lib/dev/mockDraft";
import sim from "./DevSimulator.module.css";
import styles from "./MockDraftPanel.module.css";

const KEY = "maroon-mock-team-draft";
const readRaw = () => { try { return window.localStorage.getItem(KEY) ?? ""; } catch { return ""; } };

/**
 * DEV ONLY: the Mock draft test panel, just left of the phone. Shows who's holding the phone (tap to switch — the phone
 * changes to what they see), what to do next, the checks (✅ / ❌ / waiting) and the log. "Try a wrong move", "Next pick
 * automatically" and "Run to the end" act on the same pretend server the phone uses (lib/dev/mockDraft.ts).
 */
export function MockDraftPanel({ preset, viewer, onViewer }: { preset: MockDraftPresetId; viewer: MockViewer; onViewer: (viewer: MockViewer) => void }) {
  const raw = useSyncExternalStore(subscribeMockDraft, readRaw, () => "");
  const store = useMemo<MockDraftStore | null>(() => { try { const parsed = JSON.parse(raw) as MockDraftStore; return parsed?.preset === preset ? parsed : null; } catch { return null; } }, [raw, preset]);
  // Picking a setup starts it fresh (the phone reads the same store).
  const lastPreset = useRef<string | null>(null);
  useEffect(() => { if (lastPreset.current !== preset) { lastPreset.current = preset; writeMockDraft(newMockDraft(preset)); } }, [preset]);
  const running = useRef(false);
  if (!store) return <aside className={sim.controls} aria-label="Mock draft test panel"><div className={sim.panelHeading}>Mock draft</div><p>Setting up…</p></aside>;

  const label = MOCK_DRAFT_PRESETS.find(item => item.id === preset)?.label ?? preset;
  const board = draftBoardFor(store.members, store.captains, store.settings, store.draft.picks);
  const checks = mockChecks(store);
  const apply = (next: MockDraftStore) => writeMockDraft(next);
  const first = (current: MockDraftStore) => draftBoardFor(current.members, current.captains, current.settings, current.draft.picks).available[0];
  const wrongMove = () => {
    const current = readMockDraft(preset);
    if (draftBoardFor(current.members, current.captains, current.settings, []).missingCaptains.length) return apply(mockStart(current, "organizer", "probe").store);
    if (!current.draft.startedAt) return apply(mockPick(current, "organizer", first(current), 1, "probe").store);
    const { wrong } = mockTurn(current);
    let next = wrong && first(current) ? mockPick(current, wrong, first(current), current.draft.picks.length + 1, "probe").store : current;
    const lastPicked = next.draft.picks.at(-1)?.profileId;
    const onClock = mockTurn(next).onClock;
    if (lastPicked && onClock) next = mockPick(next, onClock, lastPicked, next.draft.picks.length + 1, "probe").store;
    apply(next);
  };
  const nextPick = () => {
    const current = readMockDraft(preset);
    if (!current.draft.startedAt) return apply(mockStart(current, "organizer").store);
    const { onClock } = mockTurn(current);
    if (onClock && first(current)) apply(mockPick(current, onClock, first(current), current.draft.picks.length + 1).store);
  };
  const runToEnd = async () => {
    if (running.current) return;
    running.current = true;
    const pause = () => new Promise(resolve => window.setTimeout(resolve, 450));
    try {
      wrongMove(); await pause();
      nextPick(); await pause();
      if (readMockDraft(preset).draft.startedAt) { wrongMove(); await pause(); }             // wrong captain
      if (mockTurn(readMockDraft(preset)).onClock) { nextPick(); await pause(); wrongMove(); await pause(); } // then re-draft a drafted player
      for (let guard = 0; guard < 64 && mockTurn(readMockDraft(preset)).onClock; guard++) { nextPick(); await pause(); }
    } finally { running.current = false; }
  };

  return <aside className={`${sim.controls} ${styles.panel}`} aria-label="Mock draft test panel">
    <div className={sim.panelHeading}>Mock draft · test run</div>
    <p className={styles.setup}>{label}</p>
    <section aria-labelledby="mock-control-heading">
      <h3 id="mock-control-heading" className={styles.heading}>In control</h3>
      <div className={sim.cards}>{mockViewers(store).map(item => <button key={item} type="button" className={sim.card} aria-pressed={item === viewer} onClick={() => onViewer(item)}>
        {mockViewerLabel(store, item)}{item === mockTurn(store).onClock && <small> · on the clock</small>}</button>)}</div>
    </section>
    <section aria-labelledby="mock-next-heading">
      <h3 id="mock-next-heading" className={styles.heading}>What to do next</h3>
      <p className={styles.instruction} role="status">{mockInstruction(store, viewer)}</p>
    </section>
    <section aria-labelledby="mock-checks-heading">
      <h3 id="mock-checks-heading" className={styles.heading}>Checks</h3>
      <ul className={styles.checks}>{checks.map(check => <li key={check.id} data-state={check.state}>
        {check.state === "pass" ? <CheckCircle2 size={15} aria-label="passed" /> : check.state === "fail" ? <XCircle size={15} aria-label="failed" /> : <Circle size={15} aria-label="not checked yet" />}<span>{check.label}</span></li>)}</ul>
    </section>
    <div className={styles.actions}>
      <button type="button" onClick={wrongMove} disabled={!!store.draft.completedAt}><ShieldAlert size={13} /> Try a wrong move</button>
      <button type="button" onClick={nextPick} disabled={!!store.draft.completedAt || (!!store.draft.startedAt && board.turn === null) || (!store.draft.startedAt && board.missingCaptains.length > 0)}><Play size={13} /> Next pick automatically</button>
      <button type="button" onClick={() => void runToEnd()} disabled={!!store.draft.completedAt}><FastForward size={13} /> Run to the end</button>
      <button type="button" onClick={() => writeMockDraft(newMockDraft(preset))}><RotateCcw size={13} /> Reset</button>
    </div>
    <section aria-labelledby="mock-log-heading">
      <h3 id="mock-log-heading" className={styles.heading}>Log</h3>
      <ol className={styles.log} reversed>{[...store.log].reverse().map(entry => <li key={entry.at} data-ok={entry.ok}><strong>{entry.who}</strong> {entry.text}</li>)}{!store.log.length && <li className={styles.empty}>Nothing yet.</li>}</ol>
    </section>
  </aside>;
}
