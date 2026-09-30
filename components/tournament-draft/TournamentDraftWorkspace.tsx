"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Flag, LockKeyhole } from "lucide-react";
import { FORMATS, FORMAT_KEYS } from "@/lib/platform/formats";
import { createTournamentDraft, draftSetup, INITIAL_DRAFT_INPUT, validateDraftInput, type DraftInput, type TournamentDraft } from "@/lib/platform/tournamentDraft";
import styles from "./TournamentDraftWorkspace.module.css";

const STEPS = ["Basics", "Competition Type", "Player Count", "Structure", "Scoring Style", "Round Formats", "Optional Branding", "Review & Create"];
const STEP_FIELDS = [["name", "startDate", "endDate", "timezone", "visibility"], ["competitionType", "teamNames"], ["expectedPlayerCount"], ["roundCount"], ["scoringMode"], ["formats"], ["branding"]];
const DEFAULT_COLORS = { primary: "#500001", secondary: "#fffaf0", accent: "#c7a55e", logoUrl: null };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

export function TournamentDraftWorkspace() {
  const [input, setInput] = useState<DraftInput>(INITIAL_DRAFT_INPUT);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [draft, setDraft] = useState<TournamentDraft | null>(null);
  const [savedInput, setSavedInput] = useState<DraftInput | null>(null);
  const [editing, setEditing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step, draft, editing]);
  useEffect(() => { if (errors.length) errorBox.current?.focus(); }, [errors]);
  function update<K extends keyof DraftInput>(key: K, value: DraftInput[K]) {
    setInput(current => ({ ...current, [key]: value }));
    setErrors([]);
  }
  function go(next: number) { setErrors([]); setStep(next); }
  function edit(next: number) { setEditing(true); go(next); }
  function submit() {
    const allErrors = validateDraftInput(input);
    const relevant = step === 7 ? allErrors : allErrors.filter(error => STEP_FIELDS[step].includes(error.field));
    if (relevant.length) { setErrors(relevant.map(error => error.message)); return; }
    if (step < 7) { go(step + 1); return; }
    const result = createTournamentDraft(input);
    if (result.ok) { setDraft(result.draft); setSavedInput(input); setEditing(false); }
  }
  function download() {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${draft.basics.slug}-draft.json`; link.click(); URL.revokeObjectURL(url);
  }
  const matchPlayAvailable = input.competitionType === "teams" && input.teamNames.length === 2;
  const setup = draft ? draftSetup(draft) : null;

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.eyebrow}><Flag size={16} aria-hidden="true" /> THE MAROON / TOURNAMENT STUDIO</div>
      <p className={styles.lifecycle}>CREATE <span>&rarr;</span> EXIST <span>&rarr;</span> COMPLETE <span>&rarr;</span> PUBLISH <span>&rarr;</span> PLAY</p>
      <h1>{draft && !editing ? draft.basics.name : "A great tournament starts here."}</h1>
      <p>{draft && !editing ? "Your draft is ready. Build the rest at your own pace." : "Start with the essentials. The players, courses and finer details can follow."}</p>
    </header>
    <div className={styles.notice}><strong>Local draft preview</strong> · Kept only while this page is open. Download your draft before leaving or refreshing. No tournament site is published.</div>
    {draft && !editing && setup ? <section className={styles.dashboard}>
      <div className={styles.setupHeader}><div><span className={styles.eyebrow}>DRAFT TOURNAMENT</span><h2 ref={heading} tabIndex={-1}>Tournament Setup — {setup.percent}% Complete</h2><p>{draft.basics.startDate} – {draft.basics.endDate} · {draft.basics.timezone}</p><p>{draft.expectedPlayerCount} planned players · {draft.rounds.length} rounds · {draft.basics.visibility} when published</p></div><button className={styles.primary} onClick={download}>Download draft JSON</button></div>
      <progress aria-label="Tournament setup completion" value={setup.percent} max={100} />
      <p className={styles.muted}>{setup.completed} of {setup.total} required setup sections complete. Optional sections and locked publishing features do not affect this percentage.</p>
      <div className={styles.cards}>{setup.sections.map(section => <article className={styles.card} key={section.name}>
        <div className={styles.cardTop}><h3>{section.name}</h3><span className={styles.badge} data-status={section.status}>{section.status === "Locked" && <LockKeyhole size={12} aria-hidden="true" />}{section.status}</span></div>
        <p>{section.detail}</p>
        {section.step !== undefined ? <button className={styles.textButton} onClick={() => edit(section.step!)}>Edit {section.name.toLowerCase()} <ArrowRight size={14} aria-hidden="true" /></button> : <span className={styles.muted}>{section.status === "Locked" ? "Unavailable in draft preview" : section.name === "Teams" ? "Individual competition" : "Setup tools coming later"}</span>}
      </article>)}</div>
      <details className={styles.json}><summary>View draft configuration</summary><pre>{JSON.stringify(draft, null, 2)}</pre></details>
      <button className={styles.secondary} onClick={() => edit(0)}>Review and edit draft</button>
    </section> : <div className={styles.wizard}>
      <nav className={styles.steps} aria-label="Creation steps"><ol>{STEPS.map((label, index) => <li key={label}><button type="button" disabled={index > step} aria-current={index === step ? "step" : undefined} onClick={() => go(index)}><span className={styles.stepNumber}>{index < step ? <Check size={15} aria-hidden="true" /> : index + 1}</span>{label}</button></li>)}</ol><p>Make it yours.<br />Finish the details later.</p></nav>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); submit(); }} noValidate>
        <div className={styles.eyebrow}>STEP {step + 1} OF {STEPS.length}</div>
        <h2 ref={heading} tabIndex={-1}>{STEPS[step]}</h2>
        {errors.length > 0 && <div className={styles.errors} ref={errorBox} tabIndex={-1} role="alert"><strong>Check these details</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
        {step === 0 && <div className={styles.fields}>
          <p>Give your tournament a name and a place on the calendar.</p>
          <Field label="Tournament name"><input autoComplete="off" maxLength={80} value={input.name} onChange={event => update("name", event.target.value)} placeholder="e.g. The Autumn Invitational" required /></Field>
          <div className={styles.columns}><Field label="Start date"><input type="date" value={input.startDate} onChange={event => update("startDate", event.target.value)} required /></Field><Field label="End date"><input type="date" min={input.startDate} value={input.endDate} onChange={event => update("endDate", event.target.value)} required /></Field></div>
          <Field label="Timezone"><input list="draft-timezones" value={input.timezone} onChange={event => update("timezone", event.target.value)} required /><datalist id="draft-timezones">{["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "Europe/London", "Asia/Bangkok", "Australia/Sydney", "UTC"].map(zone => <option key={zone} value={zone} />)}</datalist></Field>
          <Field label="Privacy when published"><select value={input.visibility} onChange={event => update("visibility", event.target.value as DraftInput["visibility"])}><option value="private">Private — invited participants</option><option value="unlisted">Unlisted — anyone with the link</option><option value="public">Public — discoverable by everyone</option></select></Field>
          <p className={styles.muted}>This preference takes effect only after publishing is available. Your draft stays on this page.</p>
        </div>}
        {step === 1 && <div className={styles.fields}>
          <p>Who will compete for the title?</p><Field label="Competition type"><select value={input.competitionType} onChange={event => { const competitionType = event.target.value as DraftInput["competitionType"]; setInput(current => ({ ...current, competitionType, scoringMode: "tbd", formats: current.formats.map(() => null) })); setErrors([]); }}><option value="individual">Individual Tournament</option><option value="teams">Team Tournament</option></select></Field>
          {input.competitionType === "teams" ? <><Field label="Number of teams"><select value={input.teamNames.length} onChange={event => { const count = Number(event.target.value); setInput(current => ({ ...current, teamNames: Array.from({ length: count }, (_, index) => current.teamNames[index] ?? ""), scoringMode: count === 2 ? current.scoringMode : "tbd" })); setErrors([]); }}>{Array.from({ length: 7 }, (_, index) => <option key={index} value={index + 2}>{index + 2} teams</option>)}</select></Field><div className={styles.columns}>{input.teamNames.map((name, index) => <Field key={index} label={`Team ${index + 1} name`}><input value={name} maxLength={40} onChange={event => update("teamNames", input.teamNames.map((value, team) => team === index ? event.target.value : value))} required /></Field>)}</div><p className={styles.muted}>Colors, captains and player assignments can wait.</p></> : <p className={styles.callout}>Every player competes individually. No team setup needed.</p>}
        </div>}
        {step === 2 && <div className={styles.fields}><p>A headcount is enough for now.</p><Field label="Expected player count"><input type="number" min={2} max={64} value={input.expectedPlayerCount || ""} onChange={event => update("expectedPlayerCount", Number(event.target.value))} required /></Field><p className={styles.callout}>Add player names, emails and handicaps from setup later. No invitations are sent during creation.</p></div>}
        {step === 3 && <div className={styles.fields}><p>Plan the number of rounds. Schedule them later.</p><Field label="Number of rounds"><select value={input.roundCount} onChange={event => { const roundCount = Number(event.target.value); setInput(current => ({ ...current, roundCount, formats: Array.from({ length: roundCount }, (_, index) => current.formats[index] ?? null) })); }}>{Array.from({ length: 20 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select></Field><p className={styles.callout}>Multiple rounds can share a day. Courses, dates for individual rounds, tee times and pairings are added later.</p></div>}
        {step === 4 && <div className={styles.fields}><p>Choose what you know. Leave the rest open.</p><Field label="Scoring style"><select value={input.scoringMode} onChange={event => update("scoringMode", event.target.value as DraftInput["scoringMode"])}><option value="tbd">TBD — decide later</option>{matchPlayAvailable && <option value="match_play">Match play</option>}</select></Field><p className={styles.callout}>{matchPlayAvailable ? "Win and halve points, handicap allowances and concessions can all be decided later." : "The current scoring model supports two-team match play. Keep scoring TBD for individual or multi-team events; other scoring styles are not yet available."}</p></div>}
        {step === 5 && <div className={styles.fields}><p>Mix formats or leave every round TBD.</p>{input.competitionType === "individual" && <p className={styles.callout}>Individual round formats are not supported by the current match-format registry. Your rounds can stay TBD.</p>}{input.formats.map((format, index) => <Field key={index} label={`Round ${index + 1} format`}><select value={format ?? "tbd"} onChange={event => update("formats", input.formats.map((value, round) => round === index ? event.target.value === "tbd" ? null : event.target.value as NonNullable<typeof format> : value))}><option value="tbd">TBD — decide later</option>{input.competitionType === "teams" && FORMAT_KEYS.map(key => <option key={key} value={key}>{FORMATS[key].label}</option>)}</select></Field>)}</div>}
        {step === 6 && <div className={styles.fields}><p>A little personality, if you have it. This step is optional.</p><label className={styles.checkbox}><input type="checkbox" checked={input.branding !== null} onChange={event => update("branding", event.target.checked ? { ...DEFAULT_COLORS } : null)} />Choose tournament colors now</label>{input.branding && <><div className={styles.columns}>{(["primary", "secondary", "accent"] as const).map(key => <Field key={key} label={`${key[0].toUpperCase()}${key.slice(1)} color`}><input type="color" value={input.branding![key]} onChange={event => update("branding", { ...input.branding!, [key]: event.target.value })} /></Field>)}</div><div className={styles.colorPreview} style={{ backgroundColor: input.branding.secondary, borderColor: input.branding.accent }}><span style={{ backgroundColor: input.branding.primary }} />Tournament palette preview</div></>}<p className={styles.muted}>Destination, description, logos, photos and sponsors can all come later.</p></div>}
        {step === 7 && <div className={styles.fields}><p>Your tournament can exist before every detail is decided.</p><dl className={styles.review}>{[
          ["Tournament", input.name, 0], ["Dates", `${input.startDate} – ${input.endDate}`, 0], ["Timezone & privacy", `${input.timezone} · ${input.visibility}`, 0], ["Competition", input.competitionType === "teams" ? input.teamNames.join(" / ") : "Individual Tournament", 1], ["Players", `${input.expectedPlayerCount} expected · names added later`, 2], ["Rounds", `${input.roundCount} planned`, 3], ["Scoring", input.scoringMode === "tbd" ? "TBD" : "Match play · rules TBD", 4], ["Formats", input.formats.map((format, index) => `R${index + 1}: ${format ? FORMATS[format].label : "TBD"}`).join(" · "), 5], ["Branding", input.branding ? "Custom colors" : "Add later", 6],
        ].map(([label, value, target]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><button type="button" className={styles.textButton} onClick={() => go(Number(target))} aria-label={`Edit ${label}`}>Edit</button></div>)}</dl><p className={styles.callout}>Create a draft now. Complete setup at your own pace. Publishing and play remain locked in this preview.</p></div>}
        <div className={styles.actions}><div>{step > 0 && <button type="button" className={styles.secondary} onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden="true" />Back</button>}{editing && <button type="button" className={styles.textButton} onClick={() => { if (savedInput) setInput(savedInput); setEditing(false); }}>Cancel editing</button>}</div><button className={styles.primary} type="submit">{step === 7 ? editing ? "Update draft" : "Create draft tournament" : step === 6 && !input.branding ? "Skip for now" : "Continue"}<ArrowRight size={16} aria-hidden="true" /></button></div>
      </form>
    </div>}
  </main>;
}
