"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { CheckCircle2, Circle, Clock, FastForward, Play, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import {
  MATCH_SEL_VIEWERS, MOCK_MATCH_PRESETS, jumpMockClock, matchViewerLabel, mockMatchAct, mockMatchChecks, mockMatchInstruction, mockMatchNext, mockMatchRaw,
  mockMatchWrongMove, newMockMatch, readMockMatch, subscribeMockMatch, writeMockMatch, type MatchSelStore, type MatchSelViewer, type MockMatchPresetId,
} from "@/lib/dev/mockMatchSelection";
import { responseTurn } from "@/lib/platform/matchSelection";
import sim from "./DevSimulator.module.css";
import styles from "./MockDraftPanel.module.css";

/**
 * DEV ONLY: the Mock match selection test panel, just left of the phone (same layout as the Mock draft panel): who's
 * holding the phone (tap to switch), what to do next, the checks, the log, and buttons that act on the same pretend server
 * the phone uses — including "Jump the clock" to let a turn / ranking window run out.
 */
export function MockMatchPanel({ preset, viewer, onViewer }: { preset: MockMatchPresetId; viewer: MatchSelViewer; onViewer: (viewer: MatchSelViewer) => void }) {
  const key = `mock:${preset}`;
  const raw = useSyncExternalStore(subscribeMockMatch, () => mockMatchRaw(key), () => "");
  const store = useMemo<MatchSelStore | null>(() => { try { const parsed = JSON.parse(raw) as MatchSelStore; return parsed?.key === key ? parsed : null; } catch { return null; } }, [raw, key]);
  const lastPreset = useRef<string | null>(null);
  useEffect(() => { if (lastPreset.current !== preset) { lastPreset.current = preset; writeMockMatch(newMockMatch(preset)); } }, [preset]);
  const running = useRef(false);
  if (!store) return <aside className={sim.controls} aria-label="Mock match selection test panel"><div className={sim.panelHeading}>Mock match selection</div><p>Setting up…</p></aside>;

  const presetInfo = MOCK_MATCH_PRESETS.find(item => item.id === preset)!;
  const item = Object.values(store.rounds)[0];
  const current = () => readMockMatch(key, () => newMockMatch(preset));
  const run = (move: { viewer: MatchSelViewer; input: Parameters<typeof mockMatchAct>[3] } | null, probe = false) => { if (move) writeMockMatch(mockMatchAct(current(), item.round.key, move.viewer, move.input, { probe }).store); };
  const wrongMove = () => run(mockMatchWrongMove(current()), true);
  const nextStep = () => run(mockMatchNext(current()));
  const jump = () => writeMockMatch(jumpMockClock(current()));
  const runToEnd = async () => {
    if (running.current) return;
    running.current = true;
    const pause = () => new Promise(resolve => window.setTimeout(resolve, 400));
    const timeout = "timeout" in presetInfo && presetInfo.timeout;
    try {
      wrongMove(); await pause();
      for (let step = 0; step < 80; step++) {
        const next = mockMatchNext(current());
        if (!next) break;
        const result = mockMatchAct(current(), item.round.key, next.viewer, next.input);
        writeMockMatch(result.store); await pause();
        if (result.error) break;
        if (step === 1 || step === 2 || step === 5) { wrongMove(); await pause(); }
        if (timeout && step === 1) { jump(); await pause(); }
      }
      for (let i = 0; timeout && i < 10 && !Object.values(current().rounds)[0].state?.completedAt; i++) { jump(); await pause(); }
    } finally { running.current = false; }
  };
  const checks = mockMatchChecks(store, preset);
  const turn = item.state && item.round.type === "Response" && !item.state.completedAt ? responseTurn(item.round, item.state.spots) : null;
  const deadline = item.state?.deadline;

  return <aside className={`${sim.controls} ${styles.panel}`} aria-label="Mock match selection test panel">
    <div className={sim.panelHeading}>Mock match selection · test run</div>
    <p className={styles.setup}>{presetInfo.label}</p>
    <section aria-labelledby="mm-control-heading">
      <h3 id="mm-control-heading" className={styles.heading}>In control</h3>
      <div className={sim.cards}>{MATCH_SEL_VIEWERS.map(item => <button key={item} type="button" className={sim.card} aria-pressed={item === viewer} onClick={() => onViewer(item)}>
        {matchViewerLabel(store, item)}{turn && item === `captain-${turn.team}` && <small> · on the clock</small>}</button>)}</div>
    </section>
    <section aria-labelledby="mm-next-heading">
      <h3 id="mm-next-heading" className={styles.heading}>What to do next</h3>
      <p className={styles.instruction} role="status">{mockMatchInstruction(store, preset, viewer)}</p>
      {deadline && <p className={styles.setup} style={{ fontWeight: 500, fontSize: 12 }}>Timer ends {new Date(deadline).toLocaleTimeString()} (pretend clock{store.clockOffset ? ` +${Math.round(store.clockOffset / 60000)} min` : ""})</p>}
    </section>
    <section aria-labelledby="mm-checks-heading">
      <h3 id="mm-checks-heading" className={styles.heading}>Checks</h3>
      <ul className={styles.checks}>{checks.map(check => <li key={check.id} data-state={check.state}>
        {check.state === "pass" ? <CheckCircle2 size={15} aria-label="passed" /> : check.state === "fail" ? <XCircle size={15} aria-label="failed" /> : <Circle size={15} aria-label="not checked yet" />}<span>{check.label}</span></li>)}</ul>
    </section>
    <div className={styles.actions}>
      <button type="button" onClick={wrongMove} disabled={!!item.state?.completedAt}><ShieldAlert size={13} /> Try a wrong move</button>
      <button type="button" onClick={nextStep} disabled={!mockMatchNext(store)}><Play size={13} /> Next step automatically</button>
      <button type="button" onClick={jump} disabled={!deadline}><Clock size={13} /> Jump the clock</button>
      <button type="button" onClick={() => void runToEnd()} disabled={!!item.state?.completedAt}><FastForward size={13} /> Run to the end</button>
      <button type="button" onClick={() => writeMockMatch(newMockMatch(preset))}><RotateCcw size={13} /> Reset</button>
    </div>
    <section aria-labelledby="mm-log-heading">
      <h3 id="mm-log-heading" className={styles.heading}>Log</h3>
      <ol className={styles.log} reversed>{[...store.log].reverse().map(entry => <li key={entry.at} data-ok={entry.ok}><strong>{entry.who}</strong> {entry.text}</li>)}{!store.log.length && <li className={styles.empty}>Nothing yet.</li>}</ol>
    </section>
  </aside>;
}
