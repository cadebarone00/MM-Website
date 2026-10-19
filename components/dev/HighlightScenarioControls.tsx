"use client";
import { RotateCcw, Shuffle } from "lucide-react";
import { DEFAULT_HIGHLIGHT_SIM, DELIVERY_STATES, SCENARIOS, SIM_MEMBERS, SIM_ROUNDS, SNAPSHOT, VARIATION_CHOICES, simulate, type HighlightSim } from "@/lib/dev/highlightScenarios";
import { PREFERENCE_CATEGORIES, PREFERENCE_CATEGORY_LABELS, TRIP_TYPES, TRIP_TYPE_LABELS } from "@/lib/highlights/metadata";
import { GOLF_INTENSITIES, GOLF_INTENSITY_LABELS } from "@/lib/highlights/engine/preferences";
import styles from "./DevSimulator.module.css";

/**
 * DEV ONLY: the Notifications group's Highlights scenario controls (column 3, under the screen presets). Every choice
 * runs the real Highlights Engine (lib/dev/highlightScenarios.ts → lib/highlights/engine) on the sheet snapshot; the
 * phone preview redraws from the same state. The checklist below explains why the alert shows, is muted or isn't made.
 */
const ICON = { pass: "✓", fail: "✗", warn: "!", skip: "–" } as const;
const OUTCOME = { delivered: "Delivered", muted: "Muted by preferences", "not-created": "Not created" } as const;

export function HighlightScenarioControls({ value, onChange }: { value: HighlightSim | undefined; onChange: (next: HighlightSim | undefined) => void }) {
  const sim = value ?? { ...DEFAULT_HIGHLIGHT_SIM, source: "design" as const };
  const set = (changes: Partial<HighlightSim>) => onChange({ ...sim, ...changes });
  const engine = sim.source === "engine";
  const result = engine ? simulate(sim) : null;
  const golf = result?.scenario.group === "Golf";
  const member = (id: keyof HighlightSim, label: string) => <label>{label}<select aria-label={label} value={String(sim[id])} onChange={(e) => set({ [id]: e.target.value } as Partial<HighlightSim>)}>
    {SIM_MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.team} · group {m.group}</option>)}</select></label>;

  return <section className={styles.controlSection} aria-label="Highlights scenario">
    <h2>Highlights scenario</h2>
    <label>Data<select aria-label="Notification data" value={sim.source} onChange={(e) => e.target.value === "design" ? onChange(undefined) : set({ source: "engine" })}>
      <option value="design">Design samples (original)</option><option value="engine">Highlights Engine (sheet snapshot)</option></select></label>
    {!engine && <p>The screens show the original design samples. Switch to the Highlights Engine to preview real rules, quips and decisions.</p>}
    {engine && result && <>
      <label>Scenario<select aria-label="Highlight scenario" value={sim.scenario} onChange={(e) => set({ scenario: e.target.value })}>
        {(["Golf", "Travel"] as const).map((group) => <optgroup key={group} label={group === "Golf" ? "Golf highlights" : "Travel & itinerary alerts"}>
          {SCENARIOS.filter((s) => s.group === group).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}</select></label>
      <label>Wording<select aria-label="Variation" value={sim.variation} onChange={(e) => set({ variation: e.target.value as HighlightSim["variation"] })}>
        {VARIATION_CHOICES.map((v) => <option key={v} value={v}>{v === "random" ? "Random (anti-repeat)" : v.replace("V0", "V")}</option>)}</select></label>
      {sim.variation === "random" && <button type="button" className={styles.card} onClick={() => set({ seed: sim.seed + 1 })}><Shuffle size={13} /> New random pick</button>}

      <label>Trip competition<select aria-label="Trip competition" value={sim.tripType} onChange={(e) => set({ tripType: e.target.value as HighlightSim["tripType"] })}>
        {TRIP_TYPES.map((t) => <option key={t} value={t}>{TRIP_TYPE_LABELS[t]}</option>)}</select></label>
      <label><input type="checkbox" checked={sim.teamCompetition} disabled={sim.tripType === "individual-only" || sim.tripType === "noncompetitive"} onChange={(e) => set({ teamCompetition: e.target.checked })} /> Team competition (2 Teams)</label>
      {golf && <>
        <label>Match format<select aria-label="Match format" value={sim.matchFormat} onChange={(e) => set({ matchFormat: e.target.value as HighlightSim["matchFormat"] })}>
          <option value="singles">Singles (1 v 1)</option><option value="fourball">Fourball (pairs)</option></select></label>
        <label><input type="checkbox" checked={sim.swapSides} onChange={(e) => set({ swapSides: e.target.checked })} /> Moment is about the other side (swap Team A / B)</label>
        {member("subject", "Golfer the moment is about")}
        <label>Round<select aria-label="Round" value={sim.round} onChange={(e) => set({ round: Number(e.target.value) as HighlightSim["round"] })}>
          {SIM_ROUNDS.map((r) => <option key={r.round} value={r.round}>Round {r.round} · {r.course}</option>)}</select></label>
        <label>Hole<input type="number" aria-label="Hole" min={1} max={18} value={sim.hole} onChange={(e) => set({ hole: Math.max(1, Math.min(18, Number(e.target.value) || 1)) })} /></label>
      </>}

      {member("recipient", "Viewing as (whose phone)")}
      <label>Golf highlights (account)<select aria-label="Golf intensity" value={sim.intensity} onChange={(e) => set({ intensity: e.target.value as HighlightSim["intensity"] })}>
        {GOLF_INTENSITIES.map((i) => <option key={i} value={i}>{GOLF_INTENSITY_LABELS[i]}</option>)}</select></label>
      <label>This trip only<select aria-label="Per-trip golf intensity" value={sim.tripIntensity} onChange={(e) => set({ tripIntensity: e.target.value as HighlightSim["tripIntensity"] })}>
        <option value="inherit">Same as account</option>{GOLF_INTENSITIES.map((i) => <option key={i} value={i}>{GOLF_INTENSITY_LABELS[i]}</option>)}</select></label>
      <fieldset style={{ border: 0, padding: 0, margin: "10px 0 0" }}><legend style={{ fontSize: 11, color: "#626977" }}>Notification categories</legend>
        {PREFERENCE_CATEGORIES.map((c) => <label key={c} style={{ marginTop: 4 }}><input type="checkbox" checked={!sim.categoriesOff.includes(c)}
          onChange={(e) => set({ categoriesOff: e.target.checked ? sim.categoriesOff.filter((x) => x !== c) : [...sim.categoriesOff, c] })} /> {PREFERENCE_CATEGORY_LABELS[c]}</label>)}
      </fieldset>
      <label><input type="checkbox" checked={sim.previewDrafts} onChange={(e) => set({ previewDrafts: e.target.checked })} /> Preview Draft copy (production sends Approved only)</label>
      <label>Delivery<select aria-label="Delivery state" value={sim.delivery} onChange={(e) => set({ delivery: e.target.value as HighlightSim["delivery"] })}>
        {DELIVERY_STATES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label><input type="checkbox" checked={sim.read} onChange={(e) => set({ read: e.target.checked })} /> Marked as read</label>

      <div role="status" style={{ marginTop: 14, padding: 10, border: "1px solid #dfe2e8", borderRadius: 8, background: result.evaluation.outcome === "delivered" ? "#f3f8f3" : result.evaluation.outcome === "muted" ? "#fbf7ec" : "#fbf1f1" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 650, color: "#303643" }}>{OUTCOME[result.evaluation.outcome]}{result.evaluation.alert?.draft ? " · Draft copy" : ""}</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 11, lineHeight: 1.5, color: "#424956" }}>
          {result.evaluation.checks.map((c, i) => <li key={c.id}><b>{ICON[c.status]} {i + 1}. {c.label}</b> — {c.detail}</li>)}
        </ul>
        {result.evaluation.alert && <p>{result.evaluation.alert.variationId} · opens {result.evaluation.alert.linkLabel}<br /><span className={styles.route}>{result.evaluation.alert.link}</span></p>}
        <p>Trigger: {result.trigger}<br />Audience: {result.audienceNames.join(", ") || "nobody"}</p>
        {sim.delivery === "withdrawn" && <p>Withdrawn: a score correction removed this moment. It leaves the inbox; an already-delivered push can&rsquo;t be recalled.</p>}
        <p>Rules: {SNAPSHOT.label} · {SNAPSHOT.counts.rules} rules · not published.</p>
      </div>
      <button type="button" className={styles.card} style={{ marginTop: 10 }} onClick={() => onChange({ ...DEFAULT_HIGHLIGHT_SIM })}><RotateCcw size={13} /> Reset scenario</button>
    </>}
  </section>;
}
