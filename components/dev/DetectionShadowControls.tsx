"use client";
import { RotateCcw } from "lucide-react";
import { DETECTION_FIXTURES, simulateDetection } from "@/lib/dev/detectionScenarios";
import { DETECTION_FIXTURE_IDS, SIM_MEMBERS, type HighlightSim } from "@/lib/dev/highlightScenarios";
import { PREFERENCE_CATEGORIES, PREFERENCE_CATEGORY_LABELS, TRIP_TYPES, TRIP_TYPE_LABELS } from "@/lib/highlights/metadata";
import { GOLF_INTENSITIES, GOLF_INTENSITY_LABELS } from "@/lib/highlights/engine/preferences";
import type { ShadowOutcome } from "@/lib/highlights/detect/shadow";
import styles from "./DevSimulator.module.css";

/**
 * DEV ONLY — H5B shadow run controls (inside the Highlights scenario section, column 3). A scoring fixture goes through the
 * real detectors + engine; the phone shows what the viewer would get, and this list shows every detected moment with its
 * outcome, reason and quip. Test only: nothing is sent or stored, and the live momentum alerts are not involved.
 */
const OUTCOME: Record<ShadowOutcome, { label: string; color: string }> = {
  delivered: { label: "Delivered", color: "#2f6b34" }, duplicate: { label: "Duplicate (already delivered)", color: "#5a6170" },
  muted: { label: "Muted by preferences", color: "#8a6514" }, "volume-limited": { label: "Over the volume limit", color: "#8a6514" },
  "not-created": { label: "Not created", color: "#9b2c2c" },
};

export function DetectionShadowControls({ sim, set, onReset }: { sim: HighlightSim; set: (changes: Partial<HighlightSim>) => void; onReset: () => void }) {
  const view = simulateDetection(sim);
  const fixture = DETECTION_FIXTURES[sim.detectionFixture as keyof typeof DETECTION_FIXTURES];
  return <>
    <label>Scoring fixture<select aria-label="Scoring fixture" value={sim.detectionFixture} onChange={(e) => set({ detectionFixture: e.target.value, correction: false, restore: false, rerun: false })}>
      {DETECTION_FIXTURE_IDS.map((id) => <option key={id} value={id}>{DETECTION_FIXTURES[id].label}</option>)}</select></label>
    <label><input type="checkbox" checked={sim.correction} onChange={(e) => set({ correction: e.target.checked, restore: e.target.checked && sim.restore, rerun: false })} /> Then a score correction: {fixture.correction.label}</label>
    {fixture.restore && <label><input type="checkbox" checked={sim.restore} disabled={!sim.correction} onChange={(e) => set({ restore: e.target.checked })} /> Then restore: {fixture.restore.label}</label>}
    <label><input type="checkbox" checked={sim.rerun} onChange={(e) => set({ rerun: e.target.checked, correction: false, restore: false })} /> Then run again (replayed cards — duplicates)</label>
    <label>Trip competition<select aria-label="Trip competition" value={sim.tripType} onChange={(e) => set({ tripType: e.target.value as HighlightSim["tripType"] })}>
      {TRIP_TYPES.map((t) => <option key={t} value={t}>{TRIP_TYPE_LABELS[t]}</option>)}</select></label>
    <label>Viewing as (whose phone)<select aria-label="Viewing as" value={sim.recipient} onChange={(e) => set({ recipient: e.target.value as HighlightSim["recipient"] })}>
      {SIM_MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>Golf highlights<select aria-label="Golf intensity" value={sim.intensity} onChange={(e) => set({ intensity: e.target.value as HighlightSim["intensity"] })}>
      {GOLF_INTENSITIES.map((i) => <option key={i} value={i}>{GOLF_INTENSITY_LABELS[i]}</option>)}</select></label>
    <label><input type="checkbox" checked={!sim.categoriesOff.includes("golf-performance")} onChange={(e) => set({ categoriesOff: e.target.checked ? sim.categoriesOff.filter((c) => c !== "golf-performance") : [...sim.categoriesOff, "golf-performance"] })} /> {PREFERENCE_CATEGORY_LABELS[PREFERENCE_CATEGORIES[1]]} on</label>
    <label>Golf volume limit<select aria-label="Golf volume limit" value={sim.volumeMax} onChange={(e) => set({ volumeMax: Number(e.target.value) })}>
      <option value={0}>No limit</option><option value={2}>2 per 15 minutes</option><option value={3}>3 per 15 minutes (default)</option><option value={5}>5 per 15 minutes</option></select></label>
    <label>Big Plays<select aria-label="Exceptional moments" value={sim.exceptional} onChange={(e) => set({ exceptional: e.target.value as HighlightSim["exceptional"] })}>
      <option value="always-send">Always sent (don&rsquo;t use the limit)</option><option value="prioritize">Prioritized within the limit</option></select></label>
    <label><input type="checkbox" checked={sim.previewDrafts} onChange={(e) => set({ previewDrafts: e.target.checked })} /> Preview Draft copy (production sends Approved only)</label>
    <label><input type="checkbox" checked={sim.read} onChange={(e) => set({ read: e.target.checked })} /> Marked as read</label>

    <div role="status" style={{ marginTop: 14, padding: 10, border: "1px solid #dfe2e8", borderRadius: 8, background: "#fafbfc" }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 650, color: "#303643" }}>Shadow run · {view.report.moments.length} moment{view.report.moments.length === 1 ? "" : "s"} detected</p>
      {view.secondRun && <p>{view.secondRun}{view.report.withdrawn.length ? ` — withdrawn: ${view.report.withdrawn.length}` : ""}{view.report.added.length ? ` — new: ${view.report.added.length}` : ""}</p>}
      {view.parsNote && <p>{view.parsNote}</p>}
      {view.report.notes.map((note) => <p key={note}>{note}</p>)}
      {view.report.withdrawn.map((key) => <p key={key}>Withdrawn: {key.split(":").slice(2).join(" · ")} (leaves the inbox; a delivered push can&rsquo;t be recalled)</p>)}
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 11, lineHeight: 1.5, color: "#424956" }}>
        {view.rows.map((row) => <li key={row.moment.key} style={{ marginTop: 8 }}>
          <b>{row.moment.ruleId}{row.moment.tier ? ` × ${row.moment.tier}` : ""} · {row.moment.playerName} · hole {row.moment.hole}</b>{" "}
          <span style={{ color: OUTCOME[row.outcome].color, fontWeight: 650 }}>{OUTCOME[row.outcome].label}</span>
          {row.alert && <><br />“{row.alert.title}” — {row.alert.body} <small className={styles.route}>{row.alert.variationId}</small></>}
          {row.outcome !== "delivered" && <><br /><span style={{ color: "#6b7180" }}>{row.reason}</span></>}
        </li>)}
        {!view.rows.length && <li>Nothing detected.</li>}
      </ul>
      <p>Test only: nothing is sent or stored. The live momentum alerts keep running as they are.</p>
    </div>
    <button type="button" className={styles.card} style={{ marginTop: 10 }} onClick={onReset}><RotateCcw size={13} /> Reset detection run</button>
  </>;
}
