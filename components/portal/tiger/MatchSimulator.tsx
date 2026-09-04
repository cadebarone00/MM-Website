"use client";

import { useMemo, useState } from "react";
import { canonicalCourseName } from "@/lib/data/canonicalCourse";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { CareerCourseHole, CareerHoleRecord } from "@/lib/data/careerStats";
import { calculatePreRoundSinglesOdds } from "@/lib/odds/preRoundSingles";

type Format = "Singles" | "Fourball" | "Alternate Shot";
const selectClass = "mt-1 w-full rounded-md border border-gold-300 bg-white px-3 py-2 font-sans text-sm text-ink-900";
const american = (probability: number) => Math.round(probability >= 0.5 ? -100 * probability / (1 - probability) : 100 * (1 - probability) / probability);
const fairOdds = (probability: number) => { const value = american(probability); return `${value > 0 ? "+" : ""}${value}`; };

function PlayerSelect({ label, value, players, onChange }: { label: string; value: string; players: string[]; onChange: (value: string) => void }) {
  return <label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{label}<select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>{players.map((player) => <option key={player} value={player}>{getPlayerDisplayName(player)}</option>)}</select></label>;
}

function Range({ label, value, min, max, display, onChange, disabled = false }: { label: string; value: number; min: number; max: number; display: string; onChange: (value: number) => void; disabled?: boolean }) {
  return <label className={`block ${disabled ? "opacity-55" : ""}`}><span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{label}</span><div className="mt-2 flex items-center gap-3"><input className="w-full accent-maroon-700" type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /><span className="min-w-14 text-right font-condensed text-sm font-bold text-ink-900">{display}</span></div></label>;
}

function OutcomeBar({ aLabel, bLabel, result }: { aLabel: string; bLabel: string; result: { a: number; tie: number; b: number } | null }) {
  const outcomes = result ? [{ label: aLabel, value: result.a, tone: "bg-maroon-700" }, { label: "Tie", value: result.tie, tone: "bg-gold-400" }, { label: bLabel, value: result.b, tone: "bg-ink-700" }] : [{ label: aLabel, value: 1 / 3, tone: "bg-stone-300" }, { label: "Tie", value: 1 / 3, tone: "bg-stone-200" }, { label: bLabel, value: 1 / 3, tone: "bg-stone-300" }];
  return <section className="rounded-lg border border-gold-200 bg-white p-4"><div className="mb-3 flex items-end justify-between gap-2"><div><p className="font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">Fair match odds</p><h3 className="font-serif text-xl font-bold text-ink-900">{result ? "Pre-round probability" : "Awaiting validated model"}</h3></div>{result && <p className="font-sans text-xs text-ink-500">10,000 complete matches</p>}</div><div className="flex h-12 overflow-hidden rounded-md">{outcomes.map((outcome) => <div key={outcome.label} className={`${outcome.tone} flex min-w-0 items-center justify-center px-2 text-center font-condensed text-xs font-bold text-white`} style={{ width: `${outcome.value * 100}%` }}>{result ? `${(outcome.value * 100).toFixed(1)}%` : "—"}</div>)}</div><div className="mt-3 grid grid-cols-3 gap-2 text-center font-sans text-xs">{outcomes.map((outcome) => <div key={outcome.label}><p className="font-bold text-ink-800">{outcome.label}</p><p className="mt-1 text-ink-500">{result ? fairOdds(outcome.value) : "Not yet available"}</p></div>)}</div></section>;
}

/** Visual home for every match format. Only the pre-round Singles engine is
 * active; rules for other formats/live state are kept visibly separate until
 * their Career Archive model layers are validated. */
export function MatchSimulator({ records, courseHoles }: { records: CareerHoleRecord[]; courseHoles: CareerCourseHole[] }) {
  const players = useMemo(() => [...new Set(records.map((row) => row.player))].sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b))), [records]);
  const courses = useMemo(() => {
    const historicalCourses = new Set(records.map((row) => canonicalCourseName(row.course)));
    return [...new Set(courseHoles.map((row) => canonicalCourseName(row.course)))].filter((course) => historicalCourses.has(course)).sort();
  }, [courseHoles, records]);
  const defaultA = players.includes("PETE") ? "PETE" : players[0] ?? "";
  const defaultB = players.includes("CADE") ? "CADE" : players.find((player) => player !== defaultA) ?? "";
  const [format, setFormat] = useState<Format>("Singles");
  const [course, setCourse] = useState(courses.includes("Palmer") ? "Palmer" : courses[0] ?? "");
  const [a1, setA1] = useState(defaultA); const [a2, setA2] = useState(defaultB);
  const [b1, setB1] = useState(defaultB); const [b2, setB2] = useState(players.find((player) => player !== defaultA && player !== defaultB) ?? defaultA);
  const [holesFinished, setHolesFinished] = useState(0); const [teamAStatus, setTeamAStatus] = useState(0);
  const resetState = () => { setHolesFinished(0); setTeamAStatus(0); };
  const activeA = format === "Singles" ? a1 : `${getPlayerDisplayName(a1)} / ${getPlayerDisplayName(a2)}`;
  const activeB = format === "Singles" ? b1 : `${getPlayerDisplayName(b1)} / ${getPlayerDisplayName(b2)}`;
  const result = useMemo(() => format === "Singles" && a1 !== b1 && course ? calculatePreRoundSinglesOdds({ records, courseHoles, playerA: a1, playerB: b1, course, holesFinished, playerALead: teamAStatus }) : null, [a1, b1, course, courseHoles, format, holesFinished, records, teamAStatus]);
  const statusA = teamAStatus === 0 ? "AS" : teamAStatus > 0 ? `${teamAStatus} UP` : `${Math.abs(teamAStatus)} DOWN`;
  const statusB = teamAStatus === 0 ? "AS" : teamAStatus > 0 ? `${teamAStatus} DOWN` : `${Math.abs(teamAStatus)} UP`;
  const available = format === "Singles";
  return <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
    <section className="rounded-lg border-2 border-maroon-700 bg-cream-50 p-5"><p className="font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">MM Match Simulator · Career Archive only</p><h2 className="mt-1 font-serif text-2xl font-bold text-ink-900">Match Simulator</h2><p className="mt-1 font-sans text-sm text-ink-600">Change any control and the visual updates automatically. Player, format, and course changes reset the match to all square before the first hole.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Format<select className={selectClass} value={format} onChange={(event) => { setFormat(event.target.value as Format); resetState(); }}><option>Singles</option><option>Fourball</option><option>Alternate Shot</option></select></label><label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Course<select className={selectClass} value={course} onChange={(event) => { setCourse(event.target.value); resetState(); }}>{courses.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {format === "Singles" ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><PlayerSelect label="Player A" value={a1} players={players} onChange={(value) => { setA1(value); resetState(); }} /><PlayerSelect label="Player B" value={b1} players={players} onChange={(value) => { setB1(value); resetState(); }} /></div> : <div className="mt-4"><p className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Team A</p><div className="mt-1 grid gap-3 sm:grid-cols-2"><PlayerSelect label="Player 1" value={a1} players={players} onChange={(value) => { setA1(value); resetState(); }} /><PlayerSelect label="Player 2" value={a2} players={players} onChange={(value) => { setA2(value); resetState(); }} /></div><p className="mt-4 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Team B</p><div className="mt-1 grid gap-3 sm:grid-cols-2"><PlayerSelect label="Player 1" value={b1} players={players} onChange={(value) => { setB1(value); resetState(); }} /><PlayerSelect label="Player 2" value={b2} players={players} onChange={(value) => { setB2(value); resetState(); }} /></div></div>}
      <div className="mt-5 grid gap-4 rounded-md border border-gold-200 bg-white p-4"><Range label="Holes finished" value={holesFinished} min={0} max={18} display={String(holesFinished)} onChange={(value) => { setHolesFinished(value); setTeamAStatus((status) => Math.max(-Math.min(9, value), Math.min(Math.min(9, value), status))); }} /><div className="grid gap-3 sm:grid-cols-2"><Range label={`${format === "Singles" ? "Player" : "Team"} A status`} value={teamAStatus} min={-Math.min(9, holesFinished)} max={Math.min(9, holesFinished)} display={statusA} onChange={setTeamAStatus} /><Range label={`${format === "Singles" ? "Player" : "Team"} B status`} value={-teamAStatus} min={-Math.min(9, holesFinished)} max={Math.min(9, holesFinished)} display={statusB} onChange={() => undefined} disabled /></div></div>
      {!available && <p className="mt-4 rounded-md bg-gold-100 px-3 py-2 font-sans text-sm text-ink-700">{format} controls are ready; its scoring engine is the next model to validate.</p>}
      {available && result && <p className="mt-4 font-sans text-xs text-ink-500">{holesFinished === 0 ? "Pre-round:" : `Live through ${holesFinished}: completed-hole state is fixed and only ${18 - holesFinished} holes are simulated.`} Measure 1 + Measure 2 create 20,000 score pairs per remaining {course} hole, then the model runs 10,000 finish scenarios. Smallest samples: A {result.measureOneMinimum[0]}/{result.measureTwoMinimum[0]}, B {result.measureOneMinimum[1]}/{result.measureTwoMinimum[1]}.</p>}
    </section>
    <div className="space-y-4"><OutcomeBar aLabel={format === "Singles" ? getPlayerDisplayName(a1) : "Team A"} bLabel={format === "Singles" ? getPlayerDisplayName(b1) : "Team B"} result={result} /><section className="rounded-lg border border-gold-200 bg-white p-4"><p className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Current match state</p><p className="mt-1 font-serif text-lg font-bold text-ink-900">{activeA} {statusA} · {statusB} {activeB}</p><p className="mt-1 font-sans text-sm text-ink-600">{holesFinished === 0 ? "Pre-round" : `Through ${holesFinished}`} · {course}</p></section></div>
  </div>;
}
