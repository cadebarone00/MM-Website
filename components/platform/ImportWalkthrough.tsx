"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Search, Trash2, Trophy, User, Users } from "lucide-react";
import { DatePicker } from "./DatePicker";
import { TripScheduleCoursePicker } from "./TripScheduleCoursePicker";
import {
  WINNER_METHODS, checkDraft, emptyDraft, formatsFor, importSummary, isMatchRound, ownBall, playersPerSide,
  type DraftProblem, type DraftStep, type ImportSummary, type PastFormat, type PastTripKind, type TripDraft, type WinnerMethod,
} from "@/lib/platform/pastTripModel";
import styles from "./ImportWalkthrough.module.css";

type Step = DraftStep | "review";
const STEP_LABELS: Record<Step, string> = { kind: "Kind", basics: "Basics", rounds: "Rounds", players: "Players", matches: "Matches", scores: "Scores", review: "Review" };
const KINDS: { kind: PastTripKind; label: string; about: string; icon: typeof User }[] = [
  { kind: "individual", label: "Individual", about: "Everyone plays for themselves.", icon: User },
  { kind: "team", label: "Team", about: "Two teams play matches.", icon: Users },
  { kind: "both", label: "Both", about: "Team matches plus an individual champion.", icon: Trophy },
];
const FORMAT_LABEL: Record<PastFormat, string> = { Fourball: "Fourball (best ball)", Singles: "Singles", "Alternate Shot": "Alternate Shot", Chapman: "Chapman",
  Scramble: "Scramble", Shamble: "Shamble", "Stroke Play": "Stroke Play", Stableford: "Stableford" };
const subscribeNever = () => () => {};
const newId = () => crypto.randomUUID().slice(0, 12);
const today = () => new Date().toISOString().slice(0, 10);
const dayBefore = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const tripDays = (start: string, end: string) => {
  if (!start || !end || end < start) return [];
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 31; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) days.push(d);
  return days;
};
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const longDate = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const numberOrNull = (value: string) => value.trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);

/** Which steps this trip has: no Matches without a match round, no Scores without an individual competition. */
function stepsFor(draft: TripDraft): Step[] {
  const kind = draft.kind;
  const hasMatches = !!kind && draft.rounds.some((r) => r.format && isMatchRound(kind, r.format));
  const hasScores = !!kind && kind !== "team" && draft.rounds.some((r) => r.format && ownBall(r.format));
  return ["kind", "basics", "rounds", "players", ...(hasMatches ? ["matches" as const] : []), ...(hasScores ? ["scores" as const] : []), "review"];
}

/**
 * Golf Trips → Import past trip → Enter it in the app (project_specs.md, "Import past trip, phone-first"): seven short
 * steps — kind, basics, rounds, players, matches, scores, review — then Add trip. The draft is kept on the phone, so
 * leaving and coming back picks up where you were. The same checks as the spreadsheet run on every step and again on
 * the server. `endpoint`/`backHref`/`storageKey`: the app simulator's sample (nothing saved).
 */
export function ImportWalkthrough(props: { endpoint?: string; backHref?: string; storageKey?: string }) {
  // Browser storage only exists in the browser: render once mounted so the saved draft is read without a mismatch.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  return mounted ? <Walkthrough {...props} /> : <main className={styles.page} />;
}

function Walkthrough({ endpoint = "/api/golf-trips/import", backHref = "/golf-trips", storageKey = "maroon.pastTripDraft.v1" }: { endpoint?: string; backHref?: string; storageKey?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TripDraft>(() => {
    try { const saved = localStorage.getItem(storageKey); if (saved) return { ...emptyDraft(), ...JSON.parse(saved) }; } catch { /* no storage: start fresh */ }
    return emptyDraft();
  });
  const [step, setStep] = useState<Step>(() => draft.kind ? "basics" : "kind");
  const [tried, setTried] = useState<Partial<Record<Step, boolean>>>({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [me, setMe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState<number | null>(null);
  // A picked course's scorecard (the app's course detail) fills in that round's 18 hole pars, when the course has one.
  async function fillHolePars(roundNumber: number, ref: string) {
    try {
      const reply = await fetch(`/api/courses/${encodeURIComponent(ref)}`).then((r) => r.json());
      const card = (reply?.course?.scorecard ?? []) as { number: number; par: number }[];
      const pars = Array.from({ length: 18 }, (_, h) => card.find((x) => x.number === h + 1)?.par ?? null);
      if (pars.every((x) => x !== null)) update((d) => { const r = d.rounds.find((x) => x.number === roundNumber); if (r) { r.holePars = pars; r.par = (pars as number[]).reduce((a, b) => a + b, 0); } });
    } catch { /* no scorecard: hole pars can be typed */ }
  }
  // Rounds whose course is typed by hand instead of picked from search.
  const [typing, setTyping] = useState<Set<number>>(() => new Set());

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* storage full or blocked: keep going */ } }, [draft, storageKey]);
  const update = (change: (d: TripDraft) => void) => setDraft((d) => { const next = structuredClone(d); change(next); return next; });

  const steps = stepsFor(draft);
  const at = Math.max(0, steps.indexOf(step));
  const checked = useMemo(() => checkDraft(draft, today()), [draft]);
  const stepProblems = (s: Step) => checked.problems.filter((p) => p.step === s);
  const go = (s: Step) => {
    setError("");
    setStep(s);
    if (s === "review" && checked.trip) setSummary(importSummary(checked.trip));
    window.scrollTo({ top: 0 });
  };
  const next = () => {
    if (step !== "review" && stepProblems(step).length) { setTried((t) => ({ ...t, [step]: true })); return; }
    go(steps[Math.min(steps.length - 1, at + 1)]);
  };
  const startOver = () => { setDraft(emptyDraft()); setTried({}); setSummary(null); setMe(""); go("kind"); };

  async function addTrip() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", draft, me, requestId: crypto.randomUUID() }) });
      const reply = await response.json().catch(() => ({ ok: false, error: "Something went wrong. Try again." }));
      if (reply.ok) {
        try { localStorage.removeItem(storageKey); } catch { /* nothing to clear */ }
        return router.push(reply.url);
      }
      setError(reply.draftProblems?.[0]?.message ?? reply.error ?? "We couldn't save the trip. Try again.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const kind = draft.kind;
  const team = kind !== null && kind !== "individual";
  const days = tripDays(draft.startDate, draft.endDate);
  const named = draft.players.filter((p) => p.name.trim());
  const shown = tried[step] ? stepProblems(step) : [];

  return <main className={styles.page}>
    <div className={styles.top}>
      {at > 0 ? <button type="button" className={styles.back} onClick={() => go(steps[at - 1])}><ChevronLeft size={18} aria-hidden="true" />Back</button>
        : <Link href={backHref} className={styles.back}><ChevronLeft size={18} aria-hidden="true" />Golf Trips</Link>}
      <span className={styles.count}>Step {at + 1} of {steps.length}</span>
      <button type="button" className={styles.reset} onClick={startOver}>Start over</button>
    </div>
    <div className={styles.progress} aria-hidden="true"><span style={{ width: `${((at + 1) / steps.length) * 100}%` }} /></div>
    <h1 className={styles.title}>{step === "kind" ? "What kind of trip was it?" : STEP_LABELS[step]}</h1>

    {step === "kind" && <div className={styles.stack}>
      {KINDS.map(({ kind: k, label, about, icon: Icon }) => <button key={k} type="button" className={styles.choice} aria-pressed={draft.kind === k}
        onClick={() => { update((d) => { d.kind = k; if (k === "individual") d.matches = d.matches.filter(() => false); }); go("basics"); }}>
        <span className={styles.choiceIcon}><Icon size={18} aria-hidden="true" /></span>
        <span><span className={styles.choiceLabel}>{label}</span><span className={styles.choiceAbout}>{about}</span></span>
      </button>)}
    </div>}

    {step === "basics" && <div className={styles.stack}>
      <label className={styles.field}>Trip name<input value={draft.name} maxLength={120} placeholder="Spring Golf Trip" onChange={(e) => update((d) => { d.name = e.target.value; })} /></label>
      <label className={styles.field}>Where<input value={draft.place} maxLength={200} placeholder="Pinehurst, NC" onChange={(e) => update((d) => { d.place = e.target.value; })} /></label>
      <div className={styles.row2}>
        <label className={styles.field}>Start date<span className={styles.date} data-label={draft.startDate ? longDate(draft.startDate) : "Pick a date"} data-empty={!draft.startDate}>
          <DatePicker aria-label="Start date" value={draft.startDate} max={dayBefore(today())} onChange={(e) => update((d) => { d.startDate = e.target.value; if (!d.endDate || d.endDate < d.startDate) d.endDate = d.startDate; })} /></span></label>
        <label className={styles.field}>End date<span className={styles.date} data-label={draft.endDate ? longDate(draft.endDate) : "Pick a date"} data-empty={!draft.endDate}>
          <DatePicker aria-label="End date" value={draft.endDate} min={draft.startDate || undefined} max={dayBefore(today())} onChange={(e) => update((d) => { d.endDate = e.target.value; })} /></span></label>
      </div>
      {kind !== "team" && <label className={styles.field}>Individual winner decided by
        <select data-empty={!draft.method} value={draft.method ?? ""} onChange={(e) => update((d) => { d.method = (e.target.value || null) as WinnerMethod | null; })}>
          <option value="">Pick one</option>{WINNER_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select></label>}
    </div>}

    {step === "rounds" && kind && <div className={styles.stack}>
      {draft.rounds.map((r, i) => <section key={r.number} className={styles.card} aria-label={`Round ${r.number}`}>
        <div className={styles.cardHead}><h2>Round {r.number}</h2>
          <button type="button" className={styles.icon} aria-label={`Remove round ${r.number}`} onClick={() => update((d) => {
            d.rounds.splice(i, 1);
            d.matches = d.matches.filter((m) => m.round !== r.number);
            d.scores = d.scores.filter((s) => s.round !== r.number);
          })}><Trash2 size={16} aria-hidden="true" /></button></div>
        <label className={styles.field}>Date
          <select data-empty={!r.date} value={r.date ?? ""} onChange={(e) => update((d) => { d.rounds[i].date = e.target.value || null; })}>
            <option value="">Not sure</option>{days.map((day) => <option key={day} value={day}>{dayLabel(day)}</option>)}
          </select></label>
        <div className={styles.field}>Course
          {typing.has(r.number)
            ? <input aria-label={`Round ${r.number} course name`} value={r.course} maxLength={200} placeholder="Course name" autoFocus onChange={(e) => update((d) => { d.rounds[i].course = e.target.value; })} />
            : <button type="button" className={styles.picker} data-empty={!r.course} onClick={() => setPicking(i)}><Search size={16} aria-hidden="true" /><span>{r.course || "Search courses"}</span></button>}
          <button type="button" className={styles.typeInstead} onClick={() => setTyping((t) => { const n = new Set(t); if (n.has(r.number)) n.delete(r.number); else n.add(r.number); return n; })}>
            {typing.has(r.number) ? "Search courses instead" : "Can't find it? Type it instead"}</button>
        </div>
        <div className={`${styles.row2} ${kind !== "team" ? styles.formatRow : ""}`}>
          <label className={styles.field}>Format
            <select data-empty={!r.format} value={r.format ?? ""} onChange={(e) => update((d) => { d.rounds[i].format = (e.target.value || null) as PastFormat | null; })}>
              <option value="">Pick one</option>{formatsFor(kind).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
            </select></label>
          {kind !== "team" && <label className={styles.field}>Par
            <input inputMode="numeric" value={r.par ?? ""} placeholder="72" onChange={(e) => update((d) => { d.rounds[i].par = numberOrNull(e.target.value); })} /></label>}
        </div>
        {kind !== "team" && r.format && ownBall(r.format) && <HoleParsEditor label={`Round ${r.number}`} holePars={r.holePars}
          onChange={(pars) => update((d) => { d.rounds[i].holePars = pars; const known = pars.filter((x): x is number => x !== null); if (known.length === 18) d.rounds[i].par = known.reduce((a, b) => a + b, 0); })} />}
      </section>)}
      <button type="button" className={styles.add} onClick={() => update((d) => {
        const n = Math.max(0, ...d.rounds.map((r) => r.number)) + 1;
        const last = d.rounds.at(-1);
        d.rounds.push({ number: n, date: null, course: last?.course ?? "", format: last?.format ?? null, par: last?.par ?? null });
      })}><Plus size={16} aria-hidden="true" />Add round</button>
      {picking !== null && draft.rounds[picking] && <TripScheduleCoursePicker roundLabel={`Round ${draft.rounds[picking].number}`} askSettings={false}
        onClose={() => setPicking(null)} onPick={(course) => { const n = draft.rounds[picking].number; update((d) => { d.rounds[picking].course = course.name; if (course.par !== null) d.rounds[picking].par = course.par; }); setPicking(null); void fillHolePars(n, course.ref); }} />}
    </div>}

    {step === "players" && <div className={styles.stack}>
      {team && <div className={styles.row2}>
        {[0, 1].map((t) => <label key={t} className={styles.field}>Team {t + 1} name
          <input value={draft.teamNames[t]} maxLength={120} placeholder={t ? "Palms" : "Pines"} onChange={(e) => update((d) => { d.teamNames[t] = e.target.value; })} /></label>)}
      </div>}
      {draft.players.map((p, i) => <div key={p.id} className={styles.player}>
        <input aria-label={`Player ${i + 1} name`} value={p.name} maxLength={120} placeholder={`Player ${i + 1}`} autoFocus={i === draft.players.length - 1 && !p.name}
          onChange={(e) => update((d) => { d.players[i].name = e.target.value; })}
          onKeyDown={(e) => { if (e.key === "Enter" && p.name.trim()) update((d) => { d.players.push({ id: newId(), name: "", handicap: null, team: null }); }); }} />
        <input aria-label={`${p.name || `Player ${i + 1}`} handicap`} className={styles.hcp} inputMode="decimal" placeholder="HCP" value={p.handicap ?? ""}
          onChange={(e) => update((d) => { d.players[i].handicap = numberOrNull(e.target.value.replace(/^\+/, "-")); })} />
        <button type="button" className={styles.icon} aria-label={`Remove ${p.name || `player ${i + 1}`}`} onClick={() => update((d) => {
          d.players.splice(i, 1);
          d.matches.forEach((m) => { m.sides = [m.sides[0].filter((x) => x !== p.id), m.sides[1].filter((x) => x !== p.id)]; });
          d.scores = d.scores.filter((s) => s.player !== p.id);
        })}><Trash2 size={16} aria-hidden="true" /></button>
        {team && <div className={styles.teams} role="group" aria-label={`${p.name || "Player"}'s team`}>
          {[0, 1].map((t) => <button key={t} type="button" aria-pressed={p.team === t} onClick={() => update((d) => { d.players[i].team = t as 0 | 1; })}>
            {draft.teamNames[t].trim() || `Team ${t + 1}`}</button>)}
        </div>}
      </div>)}
      <button type="button" className={styles.add} onClick={() => update((d) => { d.players.push({ id: newId(), name: "", handicap: null, team: null }); })}>
        <Plus size={16} aria-hidden="true" />Add player</button>
      <p className={styles.hint}>Handicap is optional. A plus handicap can be typed as +2.</p>
    </div>}

    {step === "matches" && kind && <div className={styles.stack}>
      {draft.rounds.filter((r) => r.format && isMatchRound(kind, r.format)).map((r) => {
        const per = playersPerSide(r.format as PastFormat);
        const side = (s: 0 | 1) => named.filter((p) => !team || p.team === s);
        const label = (s: 0 | 1) => team ? draft.teamNames[s].trim() || `Team ${s + 1}` : `Player ${s + 1}`;
        return <section key={r.number} className={styles.card} aria-label={`Round ${r.number} matches`}>
          <div className={styles.cardHead}><h2>Round {r.number} · {FORMAT_LABEL[r.format as PastFormat]}</h2></div>
          {draft.matches.map((m, i) => m.round !== r.number ? null : <div key={m.id} className={styles.match}>
            <div className={styles.sides}>
              {([0, 1] as const).flatMap((s) => [s === 1 && <span key="vs" className={styles.vs}>VS</span>, <div key={s} className={styles.side}>
                <span className={styles.sideLabel}>{label(s)}</span>
                {Array.from({ length: per }, (_, slot) => <select key={slot} aria-label={`${label(s)} player ${slot + 1}`} data-empty={!m.sides[s][slot]} value={m.sides[s][slot] ?? ""}
                  onChange={(e) => update((d) => { const slots = Array.from({ length: per }, (_, k) => d.matches[i].sides[s][k] ?? ""); slots[slot] = e.target.value; d.matches[i].sides[s] = slots.filter(Boolean); })}>
                  <option value="">Pick player</option>{side(s).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>)}
              </div>])}
            </div>
            <div className={styles.winner} role="group" aria-label="Who won">
              {([0, "halved", 1] as const).map((w) => <button key={String(w)} type="button" aria-pressed={m.winner === w}
                onClick={() => update((d) => { d.matches[i].winner = w; })}>
                {w === "halved" ? "Halved" : team ? label(w) : (named.find((p) => p.id === m.sides[w][0])?.name ?? label(w))}</button>)}
            </div>
            <button type="button" className={styles.remove} onClick={() => update((d) => { d.matches.splice(i, 1); })}>Remove match</button>
          </div>)}
          <button type="button" className={styles.add} onClick={() => update((d) => { d.matches.push({ id: newId(), round: r.number, sides: [[], []], winner: null }); })}>
            <Plus size={16} aria-hidden="true" />Add match</button>
        </section>;
      })}
    </div>}

    {step === "scores" && kind && <div className={styles.stack}>
      <p className={styles.hint}>Type each total. Tap Holes to enter a scorecard instead. Leave blank if you don&apos;t know.</p>
      {draft.rounds.map((r) => !r.format ? null : !ownBall(r.format)
        ? <p key={r.number} className={styles.hint}>Round {r.number}: no individual scores in {r.format}.</p>
        : <ScoreRound key={r.number} round={r.number} format={r.format} par={r.par} holePars={r.holePars} players={named} draft={draft} update={update} />)}
    </div>}

    {step === "review" && <div className={styles.stack}>
      {checked.problems.length > 0 ? <>
        <p className={styles.text}>A few things to fix first:</p>
        <ul className={styles.problems}>{checked.problems.map((p, i) => <ProblemRow key={i} problem={p} onFix={() => { setTried((t) => ({ ...t, [p.step]: true })); go(p.step); }} />)}</ul>
      </> : summary && <>
        <div className={styles.summary}>
          <p className={styles.tripName}>{summary.name}</p>
          <p className={styles.meta}>{summary.place}</p>
          <dl className={styles.facts}>
            <div><dt>Players</dt><dd>{summary.players.length}</dd></div>
            <div><dt>Rounds</dt><dd>{summary.roundCount}</dd></div>
            {summary.teams && <div><dt>{summary.teams.names[0]} – {summary.teams.names[1]}</dt><dd>{summary.teams.points[0]} – {summary.teams.points[1]}</dd></div>}
            {summary.teams && <div><dt>Team winner</dt><dd>{summary.teams.winner ?? "No matches"}</dd></div>}
            {summary.champion && <div><dt>Champion ({summary.champion.method.toLowerCase()})</dt><dd>{summary.champion.name ?? "Tied"}</dd></div>}
          </dl>
        </div>
        <label className={styles.field}>Which player is you?
          <select data-empty={!me} value={me} onChange={(e) => setMe(e.target.value)}>
            <option value="">I didn&apos;t play</option>{named.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <p className={styles.hint}>Everyone else is added without an account. Send each of them an invite link from the trip&apos;s Settings → Members so it shows up for them too.</p>
      </>}
    </div>}

    {shown.length > 0 && <ul className={styles.problems} aria-label="Fix these to continue">{shown.map((p, i) => <li key={i}>{p.message}</li>)}</ul>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {step !== "kind" && <div className={styles.footer}>
      {step === "review"
        ? <button type="button" className={styles.primary} disabled={busy || checked.problems.length > 0} onClick={addTrip}>{busy ? "Adding…" : "Add trip"}</button>
        : <button type="button" className={styles.primary} onClick={next}>Next</button>}
    </div>}
  </main>;
}

function ProblemRow({ problem, onFix }: { problem: DraftProblem; onFix: () => void }) {
  return <li><span>{problem.message}</span><button type="button" onClick={onFix}>Fix</button></li>;
}

/** An 18-hole list with nulls (the shape every per-hole field is stored in). */
const blank18 = <T,>() => Array<T | null>(18).fill(null);

/**
 * A round's hole pars: an 18-box grid (front nine, back nine). Filled in from the course's scorecard when picked from
 * search; only needed for hole-by-hole stats.
 */
export function HoleParsEditor({ label, holePars, onChange }: { label: string; holePars: (number | null)[] | null | undefined; onChange: (pars: (number | null)[]) => void }) {
  const [open, setOpen] = useState(false);
  const known = (holePars ?? []).filter((h) => h !== null).length;
  return <div className={styles.parsBox}>
    <button type="button" className={styles.typeInstead} aria-expanded={open} onClick={() => setOpen(!open)}>
      {known === 18 ? `Hole pars: all 18 set${open ? "" : " · Edit"}` : known ? `Hole pars: ${known} of 18 set · Edit` : "Add hole pars (for hole-by-hole stats)"}</button>
    {open && <div className={styles.holes}>
      {Array.from({ length: 18 }, (_, h) => <label key={h}><span>{h + 1}</span>
        <input aria-label={`${label} hole ${h + 1} par`} inputMode="numeric" value={holePars?.[h] ?? ""}
          onChange={(e) => { const next = [...(holePars ?? blank18<number>())]; next[h] = numberOrNull(e.target.value); onChange(next); }} /></label>)}
    </div>}
  </div>;
}

/** Two or three small choice buttons for one hole's fairway or green (tap again to clear). */
function ShotChoice<T extends string>({ label, value, choices, onChange }: { label: string; value: T | null; choices: [T, string][]; onChange: (value: T | null) => void }) {
  return <div className={styles.shot} role="group" aria-label={label}>
    {choices.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)}>{text}</button>)}
  </div>;
}

/**
 * One own-ball round's scores: a total per player, or their hole-by-hole card. The card is 18 rows — the hole and its
 * par, strokes and putts, then fairway (par 4s and 5s) and green in regulation. Only strokes are needed; the rest is for
 * the trip's Stats and can be added later (Edit my scores).
 */
export function ScoreRound({ round, format, par, holePars, players, draft, update }: { round: number; format: PastFormat; par: number | null; holePars?: (number | null)[] | null; players: TripDraft["players"]; draft: TripDraft; update: (change: (d: TripDraft) => void) => void }) {
  const [holesFor, setHolesFor] = useState<string | null>(null);
  const stableford = format === "Stableford";
  const score = (id: string) => draft.scores.find((s) => s.round === round && s.player === id);
  const set = (id: string, change: (s: TripDraft["scores"][number]) => void) => update((d) => {
    let s = d.scores.find((x) => x.round === round && x.player === id);
    if (!s) { s = { round, player: id, total: null, holes: null }; d.scores.push(s); }
    change(s);
    if (s.total === null && !(s.holes ?? []).some((h) => h !== null)) d.scores = d.scores.filter((x) => x !== s);
  });
  const setHole = <K extends "holes" | "putts" | "fairway" | "green">(id: string, key: K, h: number, value: NonNullable<TripDraft["scores"][number][K]>[number]) =>
    set(id, (x) => { const list = [...((x[key] as unknown[] | null | undefined) ?? blank18())]; list[h] = value; (x as Record<string, unknown>)[key] = list; });
  return <section className={styles.card} aria-label={`Round ${round} scores`}>
    <div className={styles.cardHead}><h2>Round {round} · {format}{par ? ` · Par ${par}` : ""}</h2></div>
    {players.map((p) => {
      const s = score(p.id);
      const holeTotal = (s?.holes ?? []).reduce<number>((sum, h) => sum + (h ?? 0), 0);
      return <div key={p.id} className={styles.scoreRow}>
        <span className={styles.scoreName}>{p.name}</span>
        <input aria-label={`${p.name} ${stableford ? "points" : "total"}`} className={styles.total} inputMode="numeric" placeholder={stableford ? "Pts" : holeTotal ? String(holeTotal) : "Total"}
          value={s?.total ?? ""} onChange={(e) => set(p.id, (x) => { x.total = numberOrNull(e.target.value); })} />
        {!stableford && <button type="button" className={styles.holesToggle} aria-expanded={holesFor === p.id} onClick={() => setHolesFor(holesFor === p.id ? null : p.id)}>Holes</button>}
        {holesFor === p.id && <div className={styles.card18}>
          <div className={styles.card18Head} aria-hidden="true"><span>Hole</span><span>Score</span><span>Putts</span></div>
          {Array.from({ length: 18 }, (_, h) => {
            const holePar = holePars?.[h] ?? null;
            return <div key={h} className={styles.holeRow}>
              <span className={styles.holeLabel}>{h + 1}{holePar ? <small>Par {holePar}</small> : null}</span>
              <input aria-label={`${p.name} hole ${h + 1}`} inputMode="numeric" value={s?.holes?.[h] ?? ""} onChange={(e) => setHole(p.id, "holes", h, numberOrNull(e.target.value))} />
              <input aria-label={`${p.name} hole ${h + 1} putts`} inputMode="numeric" value={s?.putts?.[h] ?? ""} onChange={(e) => setHole(p.id, "putts", h, numberOrNull(e.target.value))} />
              <div className={styles.holeShots}>
                {holePar !== 3 && <ShotChoice label={`${p.name} hole ${h + 1} fairway`} value={s?.fairway?.[h] ?? null} onChange={(v) => setHole(p.id, "fairway", h, v)}
                  choices={[["left", "← FW"], ["center", "FW ✓"], ["right", "FW →"]]} />}
                <ShotChoice label={`${p.name} hole ${h + 1} green`} value={s?.green?.[h] ?? null} onChange={(v) => setHole(p.id, "green", h, v)}
                  choices={[["center", "GIR ✓"], ["right", "GIR ✗"]]} />
              </div>
            </div>;
          })}
        </div>}
      </div>;
    })}
  </section>;
}
