"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SIM_ORIGIN, consoleReducer, consoleState, guardedPoll, iframeTransport, replayWhenCurrent, phoneHost, phoneUrl, type ConsoleModel, type FrameLike } from "@/lib/dev/sim/console";
import { createRunner, type Runner, type RunnerState } from "@/lib/dev/sim/studio/runner";
import { playScript, type SimStep } from "@/lib/dev/sim/studio/script";
import type { SampleCourse } from "@/lib/dev/sim/studio/courses";
import type { StudioSetup } from "@/lib/dev/sim/studio/setup";
import { PhoneGrid } from "./PhoneGrid";
import { StudioSetupForm } from "./StudioSetupForm";
import { StudioSteps } from "./StudioSteps";
import styles from "./SimulatorConsole.module.css";

type Phone = { person: string; label: string; startPath: string };
type Status = { ok: boolean; scenario: string | null; setup?: StudioSetup; phones: Phone[]; people: { key: string; name: string }[]; pages?: Record<string, { path: string; history: string[] }> };
type Check = { id: string; label: string; status: "pass" | "fail" | "waiting"; detail: string };
type LogEntry = { n: number; at: string; person: string | null; kind: string; text: string; ok: boolean };
type Preset = { id: string; label: string; setup: StudioSetup };
type Model = ConsoleModel<Status, Runner>;

const IDLE: RunnerState = { index: 0, status: "idle", message: null, done: [] };

/** GET or POST to the simulator's front door; null when it cannot be reached. */
async function door<T>(path: string, post = false, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${SIM_ORIGIN}${path}`, post ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) } : { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}

export function SimulatorConsole({ presets, courses }: { presets: Preset[]; courses: SampleCourse[] }) {
  const [model, dispatch] = useReducer(
    (m: Model, ev: Parameters<typeof consoleReducer<Status, Runner>>[1]) => consoleReducer<Status, Runner>(m, ev),
    { status: null, steps: [], runner: null } as Model,
  );
  const { status, runner } = model;
  const steps = model.steps as SimStep[];
  const [setup, setSetup] = useState<StudioSetup>(presets[0].setup);
  const [speed, setSpeed] = useState(600);
  const [rState, setRState] = useState<RunnerState>(IDLE);
  const [notice, setNotice] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState<Record<string, number>>({});
  const [replaying, setReplaying] = useState(false);
  const [pages, setPages] = useState<Status["pages"]>({});
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const lastN = useRef(0);
  const epoch = useRef(0); // bumped by every Create / Reset so a replay that started earlier can tell it is stale
  const adopted = useRef(false);
  const generation = useRef(0); // bumped by Create / Reset / Check again so slow answers from before are dropped
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({});
  const readyRef = useRef<Record<string, boolean>>({});
  const phonesRef = useRef<string[]>([]);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const transport = useMemo(() => iframeTransport((p) => (frames.current[p] as unknown as FrameLike | null) ?? null, SIM_ORIGIN), []);

  const running = status !== null && consoleState(status) === "running";
  const phones = running && status !== "error" ? status.phones : [];
  phonesRef.current = phones.map((p) => p.person);
  const names: Record<string, string> = status && status !== "error" ? Object.fromEntries(status.people.map((p) => [p.key, p.name])) : {};

  const refreshStatus = useCallback(async () => {
    const s = await door<Status>("/__sim/status");
    dispatch({ type: "status", status: s ?? "error" });
  }, []);
  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  // Messages from the phones: the transport takes done/ready for the runner; here we also note which phones have loaded.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      transport.onMessage(e);
      const msg = e.data as { sim?: string } | null;
      if (msg?.sim !== "ready") return;
      const person = phonesRef.current.find((p) => frames.current[p]?.contentWindow === e.source);
      if (person && !readyRef.current[person]) { readyRef.current = { ...readyRef.current, [person]: true }; setReady(readyRef.current); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [transport]);

  // Follow the runner; a runner that was thrown away (simulator restarted) is told to stop after its current step.
  useEffect(() => {
    if (!runner) { setRState(IDLE); return; }
    setRState(runner.state());
    const off = runner.subscribe(setRState);
    return () => { off(); runner.pause(); };
  }, [runner]);

  const resetReady = (only?: string) => {
    readyRef.current = only ? { ...readyRef.current, [only]: false } : {};
    setReady(readyRef.current);
  };
  const reloadAll = () => { resetReady(); setReloads((r) => ({ ...r, all: (r.all ?? 0) + 1 })); };
  const reloadOne = (person: string) => {
    // Re-set src on the SAME iframe (no remount), so a step in flight sees this element's `load` and takes the reload path.
    const el = frames.current[person];
    if (!el) return;
    resetReady(person);
    el.src = phoneHost(person) + (pages?.[person]?.path ?? "/");
  };
  const allReady = phones.length > 0 && phones.every((p) => ready[p.person]);
  const waitPhones = async () => {
    for (let i = 0; i < 300; i++) {
      if (phonesRef.current.length > 0 && phonesRef.current.every((p) => readyRef.current[p])) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  const buildRunner = (s: StudioSetup) => {
    const course = courses.find((c) => c.ref === s.course);
    if (!course) return null;
    const list = playScript(s, course);
    return { steps: list, runner: createRunner(list, transport, { delayMs: speedRef.current }) };
  };

  /** Create (POST the setup) or Reset (start the same round again): fresh phones, fresh runner at step 0. */
  async function start(path: "/__sim/custom" | "/__sim/reset", useSetup: StudioSetup) {
    setBusy(true); setNotice(null);
    epoch.current += 1;
    generation.current += 1;
    const s = await door<Status>(path, true, path === "/__sim/custom" ? { setup: useSetup } : undefined);
    setBusy(false);
    if (!s || !s.ok) { setNotice("The simulator didn't accept that. Check it is still running."); void refreshStatus(); return null; }
    generation.current += 1;
    lastN.current = 0; setLog([]); setChecks([]); setPages({});
    const planned = buildRunner(path === "/__sim/reset" && s.setup ? s.setup : useSetup);
    if (!planned) { setNotice("That course isn't in the sample list."); return null; }
    reloadAll();
    dispatch({ type: "created", status: s, steps: planned.steps, runner: planned.runner });
    return planned.runner;
  }
  const create = () => void start("/__sim/custom", setup);
  const reset = () => void start("/__sim/reset", status && status !== "error" && status.setup ? status.setup : setup);
  const fastForward = async (index: number) => {
    if (!runner) return;
    if (index > rState.index) { await runner.jumpTo(index); return; }
    // Going back: start the same round again, then replay to that step with no waiting.
    setReplaying(true);
    try {
      const fresh = await start("/__sim/reset", status && status !== "error" && status.setup ? status.setup : setup);
      if (fresh) await replayWhenCurrent(epoch, epoch.current, waitPhones, () => fresh.jumpTo(index));
    } finally { setReplaying(false); }
  };

  // First load with a round already running: rebuild its steps so Reset works (the phones reload on this page anyway).
  useEffect(() => {
    if (adopted.current || !status || status === "error" || !status.ok) return;
    adopted.current = true;
    if (status.scenario !== "custom" || !status.setup) return;
    const planned = buildRunner(status.setup);
    if (planned) { setSetup(status.setup); dispatch({ type: "created", status, steps: planned.steps, runner: planned.runner }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Checks (and each phone's page) every 2 s, log every 1 s, only while the simulator is running. A poll is skipped while
  // the last one is still out; three misses in a row re-check the simulator and show the start card if it is gone.
  useEffect(() => {
    if (!running) return;
    let alive = true;
    let misses = 0, checking = false, logging = false;
    const recheck = async () => {
      const s = await door<Status>("/__sim/status");
      if (alive) dispatch(s ? { type: "restarted", status: s } : { type: "status", status: "error" });
    };
    const miss = async () => {
      if (++misses < 3) return;
      misses = 0;
      await recheck();
    };
    const pollChecks = async () => {
      if (checking) return;
      checking = true;
      let failed = false;
      const applied = await guardedPoll(generation, () => alive,
        () => Promise.all([door<Check[]>("/__sim/checks"), door<Status>("/__sim/status")]),
        ([c, s]) => { if (!c || !s) { failed = true; return; } misses = 0; setChecks(c); setPages(s.pages ?? {}); });
      checking = false;
      if (applied && failed) await miss();
    };
    const pollLog = async () => {
      if (logging) return;
      logging = true;
      let failed = false;
      const applied = await guardedPoll(generation, () => alive, () => door<LogEntry[]>(`/__sim/log?since=${lastN.current}`), (rows) => {
        if (!rows) { failed = true; return; }
        if (rows.length === 0) return;
        const top = Math.max(...rows.map((r) => r.n));
        if (top < lastN.current) { lastN.current = 0; setLog([]); void recheck(); return; } // the simulator restarted
        lastN.current = top;
        setLog((old) => {
          const seen = new Set(old.map((o) => o.n));
          const added = rows.filter((r) => !seen.has(r.n)).reverse();
          return added.length ? [...added, ...old].slice(0, 500) : old;
        });
      });
      logging = false;
      if (applied && failed) await miss();
    };
    void pollChecks(); void pollLog();
    const a = setInterval(pollChecks, 2000), b = setInterval(pollLog, 1000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [running]);

  if (status === null) return <main className={styles.page}><p className={styles.empty}>Looking for the simulator...</p></main>;

  if (!running) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h2>Start the simulator</h2>
          <p>Run <code>npm run sim</code> in the terminal, wait for it to say it is ready, then come back here.</p>
          <div><button type="button" className={`${styles.btn} ${styles.btnMain}`} onClick={() => { generation.current += 1; dispatch({ type: "status", status: "error" }); void refreshStatus(); }}>Check again</button></div>
        </div>
      </main>
    );
  }

  const playing = rState.status === "running" || replaying;
  const shown = log.filter((l) => filter === "all" || l.person === filter);
  const activePhone = playing ? steps[rState.index]?.phone ?? null : null;
  const gridPhones = phones.map((p) => ({
    person: p.person, name: names[p.person] ?? p.person, role: p.label,
    src: phoneUrl(p.person, "/"), reloadKey: `${reloads.all ?? 0}-${reloads[p.person] ?? 0}`,
  }));

  return (
    <main className={styles.studio}>
      <aside className={styles.side}>
        <h1 className={styles.title}>Scoring</h1>
        <StudioSetupForm setup={setup} onChange={setSetup} presets={presets} courses={courses} busy={busy || playing} onCreate={create} />
        {notice && <p className={styles.error} role="alert">{notice}</p>}
        <StudioSteps
          steps={steps} state={rState} runner={runner} canStart={allReady} speed={speed} busy={busy || playing || !runner}
          onSpeed={(ms) => { setSpeed(ms); runner?.setDelay(ms); }} onJump={(i) => void fastForward(i)} onReset={reset}
        />
        {runner && !allReady && <p className={styles.empty}>Waiting for the phones to load...</p>}
        <details className={styles.block} open>
          <summary>Checks</summary>
          {checks.length === 0 ? <p className={styles.empty}>No checks yet.</p> : (
            <ul className={styles.list}>
              {checks.map((c) => (
                <li key={c.id} className={styles.check}>
                  <span className={`${styles.dot} ${styles[c.status]}`} aria-label={c.status} />
                  <span><strong>{c.label}</strong><span className={styles.detail}>{c.detail}</span></span>
                </li>
              ))}
            </ul>
          )}
        </details>
        <details className={styles.block}>
          <summary>What happened</summary>
          <select className={`${styles.select} ${styles.filter}`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Person filter">
            <option value="all">Everyone</option>
            {phones.map((p) => <option key={p.person} value={p.person}>{names[p.person] ?? p.person}</option>)}
          </select>
          {shown.length === 0 ? <p className={styles.empty}>Nothing yet.</p> : (
            <ul className={styles.list}>
              {shown.map((l) => (
                <li key={l.n} className={`${styles.logRow} ${l.ok ? "" : styles.bad}`}>
                  <time>{new Date(l.at).toLocaleTimeString()}</time>
                  <b>{l.person ? names[l.person] ?? l.person : "sim"}</b>
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </aside>
      {gridPhones.length === 0
        ? <div className={styles.phoneArea}><p className={styles.empty}>Fill in the setup and press Create to put the phones on a round.</p></div>
        : <PhoneGrid phones={gridPhones} active={activePhone} frames={frames} onReload={reloadOne} />}
    </main>
  );
}
