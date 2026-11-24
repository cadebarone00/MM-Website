"use client";

import { PLAYER_NAMES, keyFor, validateSetup, type StudioSetup } from "@/lib/dev/sim/studio/setup";
import type { SampleCourse } from "@/lib/dev/sim/studio/courses";
import styles from "./SimulatorConsole.module.css";

type Preset = { id: string; label: string; setup: StudioSetup };
const CUSTOM = "__custom";

/** The setup form: preset, players (1 to 4), course and tee, game, guest, seed. Create is disabled while the setup is invalid. */
export function StudioSetupForm({ setup, onChange, presets, courses, busy, onCreate }: {
  setup: StudioSetup; onChange: (s: StudioSetup) => void; presets: Preset[]; courses: SampleCourse[]; busy: boolean; onCreate: () => void;
}) {
  const problem = validateSetup(setup);
  const course = courses.find((c) => c.ref === setup.course);

  const setName = (i: number, name: string) => {
    const others = setup.players.filter((_, j) => j !== i).map((p) => p.key);
    const key = keyFor(name, others);
    const was = setup.players[i];
    onChange({ ...setup, host: was.key === setup.host ? key : setup.host, players: setup.players.map((p, j) => (j === i ? { key, name } : p)) });
  };
  const addPlayer = () => {
    const taken = setup.players.map((p) => p.name.toLowerCase());
    const name = PLAYER_NAMES.find((n) => !taken.includes(n.toLowerCase())) ?? "";
    onChange({ ...setup, players: [...setup.players, { key: keyFor(name, setup.players.map((p) => p.key)), name }] });
  };
  const removePlayer = (i: number) => {
    const players = setup.players.filter((_, j) => j !== i);
    onChange({ ...setup, players, host: players.some((p) => p.key === setup.host) ? setup.host : players[0]?.key ?? "" });
  };
  const pickCourse = (ref: string) => {
    const c = courses.find((x) => x.ref === ref);
    onChange({ ...setup, course: ref, tee: c?.tees[0]?.name ?? "" });
  };

  return (
    <section className={styles.block}>
      <h2>Setup</h2>
      <select className={styles.select} aria-label="Preset" value={CUSTOM} onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) onChange(p.setup); }}>
        <option value={CUSTOM}>Pick a preset to fill the form...</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      <span className={styles.label}>Players</span>
      {setup.players.map((p, i) => {
        const listed = PLAYER_NAMES.includes(p.name);
        return (
          <div key={i} className={styles.row}>
            <select className={styles.select} aria-label={`Player ${i + 1}`} value={listed ? p.name : CUSTOM} onChange={(e) => setName(i, e.target.value === CUSTOM ? "" : e.target.value)}>
              {PLAYER_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={CUSTOM}>Type a name...</option>
            </select>
            {!listed && <input className={styles.input} aria-label={`Player ${i + 1} name`} value={p.name} maxLength={40} placeholder="Name" onChange={(e) => setName(i, e.target.value)} />}
            <label className={styles.radio}><input type="radio" name="host" checked={setup.host === p.key} onChange={() => onChange({ ...setup, host: p.key })} />Host</label>
            <button type="button" className={styles.icon} aria-label={`Remove player ${i + 1}`} disabled={setup.players.length <= 1} onClick={() => removePlayer(i)}>×</button>
          </div>
        );
      })}
      <div><button type="button" className={styles.btn} disabled={setup.players.length >= 4} onClick={addPlayer}>Add player</button></div>

      <span className={styles.label}>Course and tee</span>
      <div className={styles.row}>
        <select className={styles.select} aria-label="Course" value={setup.course} onChange={(e) => pickCourse(e.target.value)}>
          {courses.map((c) => <option key={c.ref} value={c.ref}>{c.name}</option>)}
        </select>
        <select className={styles.select} aria-label="Tee" value={setup.tee} onChange={(e) => onChange({ ...setup, tee: e.target.value })}>
          {(course?.tees ?? []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>

      <span className={styles.label}>Game</span>
      <select className={styles.select} aria-label="Game" value={setup.game} onChange={(e) => onChange({ ...setup, game: e.target.value === "skins" ? "skins" : "none" })}>
        <option value="none">None</option>
        <option value="skins">Skins</option>
      </select>

      <span className={styles.label}>Guest (optional)</span>
      <input className={styles.input} aria-label="Guest name" value={setup.guest ?? ""} maxLength={40} placeholder="No guest" onChange={(e) => onChange({ ...setup, guest: e.target.value.trim() ? e.target.value : null })} />

      <span className={styles.label}>Seed</span>
      <div className={styles.row}>
        <input className={styles.input} type="number" min={0} step={1} aria-label="Seed" value={Number.isFinite(setup.seed) ? setup.seed : ""} onChange={(e) => onChange({ ...setup, seed: e.target.value === "" ? NaN : Number(e.target.value) })} />
        <button type="button" className={styles.btn} onClick={() => onChange({ ...setup, seed: Math.floor(Math.random() * 1_000_000) })}>New seed</button>
      </div>

      {problem && <p className={styles.error} role="alert">{problem}</p>}
      <div><button type="button" className={`${styles.btn} ${styles.btnMain}`} disabled={busy || !!problem} onClick={onCreate}>Create</button></div>
    </section>
  );
}
