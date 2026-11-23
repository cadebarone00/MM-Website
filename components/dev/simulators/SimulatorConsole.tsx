"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SIM_ORIGIN, consoleState, guardedPoll, phoneHost, phoneUrl } from "@/lib/dev/sim/console";
import styles from "./SimulatorConsole.module.css";

type Scenario = { id: string; label: string; feature: string };
type Phone = { person: string; label: string; startPath: string };
type Status = { ok: boolean; scenario: string | null; phones: Phone[]; people: { key: string; name: string }[]; pages?: Record<string, { path: string; history: string[] }> };
type Check = { id: string; label: string; status: "pass" | "fail" | "waiting"; detail: string };
type LogEntry = { n: number; at: string; person: string | null; kind: string; text: string; ok: boolean };

const FEATURES = ["Play", "Trip", "Tourney", "League"];

/** GET or POST to the simulator's front door; null when it cannot be reached. */
async function door<T>(path: string, post = false, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${SIM_ORIGIN}${path}`, post ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) } : { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}

export function SimulatorConsole({ scenarios }: { scenarios: Scenario[] }) {
  const [status, setStatus] = useState<Status | "error" | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState<Record<string, number>>({});
  const [pages, setPages] = useState<Status["pages"]>({});
  const [backTo, setBackTo] = useState<Record<string, string>>({});
  const lastN = useRef(0);
  const generation = useRef(0); // bumped by scenario / Reset / Check again so slow answers from before are dropped

  const names: Record<string, string> = status && status !== "error" ? Object.fromEntries(status.people.map((p) => [p.key, p.name])) : {};
  const running = status !== null && consoleState(status) === "running";

  const refreshStatus = useCallback(async () => {
    const s = await door<Status>("/__sim/status");
    setStatus(s ?? "error");
  }, []);
  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  // Picking a scenario / Reset reloads through phoneUrl (signs in, clears the phone). Reload and Refresh keep the phone's
  // storage and open the page it is on: the front door adds the sign-in cookie itself.
  const reloadAll = () => setReloads((r) => ({ ...r, all: (r.all ?? 0) + 1 }));
  const reloadOne = (person: string) => setReloads((r) => ({ ...r, [person]: (r[person] ?? 0) + 1 }));
  const pageOf = (p: Phone) => phoneHost(p.person) + (pages?.[p.person]?.path ?? p.startPath);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    generation.current += 1;
    const s = await door<Status>(path, true, body);
    setBusy(false);
    if (!s) { void refreshStatus(); return; }
    generation.current += 1;
    lastN.current = 0; setLog([]); setChecks([]); setPages({}); setBackTo({});
    setStatus(s);
    reloadAll();
  }

  // Checks (and each phone's page) every 2 s, log every 1 s, only while the simulator is running. A poll is skipped while
  // the last one is still out; three misses in a row re-check the simulator and show the start card if it is gone.
  useEffect(() => {
    if (!running) return;
    let alive = true;
    let misses = 0, checking = false, logging = false;
    const miss = async () => {
      if (++misses < 3) return;
      misses = 0;
      const s = await door<Status>("/__sim/status");
      if (alive && !s) setStatus("error");
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
        if (top < lastN.current) { lastN.current = 0; setLog([]); return; } // the simulator restarted
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

  async function goBack(person: string) {
    const r = await door<{ path: string | null }>("/__sim/back", true, { person });
    if (r?.path) { setBackTo((b) => ({ ...b, [person]: phoneHost(person) + r.path })); reloadOne(person); }
  }

  if (status === null) return <main className={styles.page}><p className={styles.empty}>Looking for the simulator...</p></main>;

  if (!running) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h2>Start the simulator</h2>
          <p>Run <code>npm run sim</code> in the terminal, wait for it to say it is ready, then come back here.</p>
          <div><button type="button" className={`${styles.btn} ${styles.btnMain}`} onClick={() => { generation.current += 1; setStatus(null); void refreshStatus(); }}>Check again</button></div>
        </div>
      </main>
    );
  }

  const phones = status !== "error" ? status.phones : [];
  const current = status !== "error" ? status.scenario : null;
  const shown = log.filter((l) => filter === "all" || l.person === filter);

  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <h1 className={styles.title}>Scoring</h1>
        <span className={styles.label}>Scenario</span>
        <select className={styles.select} value={current ?? ""} disabled={busy} onChange={(e) => e.target.value && void act("/__sim/scenario", { id: e.target.value })} aria-label="Scenario">
          <option value="">Pick a scenario...</option>
          {FEATURES.map((feature) => {
            const list = scenarios.filter((s) => s.feature === feature);
            return list.length ? <optgroup key={feature} label={feature}>{list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup> : null;
          })}
        </select>
        <button type="button" className={styles.btn} disabled={busy || !current} onClick={() => void act("/__sim/reset")}>Reset</button>
        <button type="button" className={styles.btn} disabled={!current} onClick={() => { if (status && status !== "error") setBackTo(Object.fromEntries(status.phones.map((p) => [p.person, pageOf(p)]))); reloadAll(); }}>Refresh all phones</button>
      </div>

      {phones.length === 0 ? <p className={styles.empty}>Pick a scenario to put the phones on a round.</p> : (
        <div className={styles.phones}>
          {phones.map((p) => (
            <section key={p.person} className={styles.phone}>
              <div className={styles.phoneHead}>
                <div className={styles.phoneName}><strong>{names[p.person] ?? p.person}</strong><span>{p.label}</span></div>
                <span className={styles.phoneBtns}>
                  <button type="button" className={styles.btn} disabled={(pages?.[p.person]?.history.length ?? 0) < 2} onClick={() => void goBack(p.person)}>Back</button>
                  <button type="button" className={styles.btn} onClick={() => { setBackTo((b) => ({ ...b, [p.person]: pageOf(p) })); reloadOne(p.person); }}>Reload</button>
                </span>
              </div>
              <div className={styles.address} title="The page this phone is on">{pages?.[p.person]?.path ?? p.startPath}</div>
              <iframe key={`${current}-${reloads.all ?? 0}-${reloads[p.person] ?? 0}-${backTo[p.person] ?? ""}`} className={styles.frame} title={`${p.person} phone`} src={backTo[p.person] ?? phoneUrl(p.person, p.startPath)} />
            </section>
          ))}
        </div>
      )}

      <div className={styles.panels}>
        <section className={styles.panel}>
          <h2>Checks</h2>
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
        </section>
        <section className={styles.panel}>
          <h2>What happened</h2>
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
        </section>
      </div>
    </main>
  );
}
