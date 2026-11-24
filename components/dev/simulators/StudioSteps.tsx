"use client";

import type { Runner, RunnerState } from "@/lib/dev/sim/studio/runner";
import type { SimStep } from "@/lib/dev/sim/studio/script";
import styles from "./SimulatorConsole.module.css";

/** The steps list and its controls: Next step, Play all, Pause, Skip, speed, and Fast-forward to on each step. */
export function StudioSteps({ steps, state, runner, speed, onSpeed, canStart, onJump, onReset, busy }: {
  canStart: boolean; steps: SimStep[]; state: RunnerState; runner: Runner | null; speed: number; onSpeed: (ms: number) => void;
  onJump: (index: number) => void; onReset: () => void; busy: boolean;
}) {
  const running = state.status === "running";
  const finished = state.status === "done";
  const problem = state.status === "stopped" || state.status === "failed";
  return (
    <section className={styles.block}>
      <h2>Steps</h2>
      {steps.length === 0 ? <p className={styles.empty}>Create a round to get the steps.</p> : (
        <>
          <div className={styles.row}>
            <button type="button" className={`${styles.btn} ${styles.btnMain}`} disabled={!runner || !canStart || running || finished} onClick={() => void runner?.next()}>Next step</button>
            <button type="button" className={styles.btn} disabled={!runner || !canStart || running || finished} onClick={() => void runner?.playAll()}>Play all</button>
            <button type="button" className={styles.btn} disabled={!runner || !running} onClick={() => runner?.pause()}>Pause</button>
            <button type="button" className={styles.btn} disabled={!runner || !canStart || running || finished} onClick={() => runner?.skip()}>Skip</button>
            <button type="button" className={styles.btn} disabled={busy} onClick={onReset}>Reset</button>
          </div>
          <label className={styles.speed}>
            <span className={styles.label}>Wait between actions</span>
            <input type="range" min={0} max={2000} step={50} value={speed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="Speed in milliseconds between actions" />
            <span>{speed} ms</span>
          </label>
          {problem && state.message && <p className={styles.error} role="alert">{state.message}</p>}
          <ol className={styles.steps}>
            {steps.map((s, i) => {
              const tick = state.done.includes(s.id);
              const current = i === state.index && !finished;
              return (
                <li key={s.id} className={`${styles.step} ${current ? styles.current : ""} ${current && problem ? styles.stepBad : ""}`}>
                  <span className={styles.tick} aria-label={tick ? "done" : current ? "next" : "waiting"}>{tick ? "✓" : current ? "▶" : ""}</span>
                  <span className={styles.stepText}><b>{s.name ?? s.phone}</b> {s.say}</span>
                  <button type="button" className={styles.link} disabled={!runner || !canStart || running || i === state.index} onClick={() => onJump(i)}>Fast-forward to</button>
                </li>
              );
            })}
          </ol>
          {finished && <p className={styles.empty}>All steps done.</p>}
        </>
      )}
    </section>
  );
}
