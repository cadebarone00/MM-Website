"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, Plus, Share2, X } from "lucide-react";
import { DatePicker } from "@/components/platform/DatePicker";
import { ExploreCourseSearch, place, type CourseResult } from "./ExploreCourseSearch";
import { formatCode, type CodeRoundSetup } from "@/lib/platform/codeTournaments";
import type { ScoringCourse } from "@/lib/platform/personalRound";
import styles from "./PlayRound.module.css";
import own from "./CodeTournament.module.css";
import { InvitePlayersCard } from "./InvitePlayersCard";

type NewRound = { setup: CodeRoundSetup; date: string };
const today = () => new Date().toLocaleDateString("en-CA");
const handicapValue = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null; };
const roundDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * Create a tournament (/tournaments/code/new): name, Gross / Net, whether I'm playing (my handicap for net), and one or
 * more rounds (course from the course search, tee, date). Create shows the join code to send out. A cut is set later, in
 * Tournament Settings → Cut.
 * `sample` (app simulator only): Create shows a made-up code and saves nothing.
 */
export function CodeTournamentCreate({ sample = false }: { sample?: boolean } = {}) {
  const [name, setName] = useState("");
  const [scoring, setScoring] = useState<"Gross" | "Net">("Gross");
  const [plays, setPlays] = useState(true);
  const [handicap, setHandicap] = useState("");
  const [rounds, setRounds] = useState<NewRound[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; code: string } | null>(null);
  const needsHandicap = scoring === "Net" && plays;
  const ready = name.trim().length > 0 && rounds.length > 0 && (!needsHandicap || handicapValue(handicap) !== null);

  async function create() {
    if (!ready) return;
    if (sample) { setMade({ id: "sample", code: "K7Q4MZ" }); return; }
    setBusy(true); setError(null);
    const reply = await fetch("/api/code-tournaments", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), scoring, plays, handicap: needsHandicap ? handicapValue(handicap) : null, rounds }) })
      .then((r) => r.json() as Promise<{ ok: boolean; id?: string; code?: string; message?: string }>).catch(() => null);
    setBusy(false);
    if (reply?.ok && reply.id && reply.code) { setMade({ id: reply.id, code: reply.code }); return; }
    setError(reply?.message ?? (reply === null ? "No connection. Try again when you're back online." : "Couldn't create the tournament. Try again."));
  }

  if (made) return <CodeReady name={name.trim()} id={made.id} code={made.code} net={scoring === "Net"} sample={sample} />;
  const backFromRound = () => setAdding(false);
  if (adding) return <AddRound onCancel={backFromRound} onAdd={(round) => { setRounds((all) => [...all, round]); backFromRound(); }} />;

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/tournaments/join" className={styles.back} aria-label="Back to Tourneys"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Create a tournament</p></header>
    <section className={styles.panel}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <label className={styles.field}><span>Tournament name</span>
          <input value={name} maxLength={60} placeholder="e.g. Member-Guest 2026" onChange={(event) => setName(event.target.value)} /></label>
        <fieldset className={styles.field}><legend>Scoring</legend>
          <div className={styles.choices}>{(["Gross", "Net"] as const).map((value) =>
            <button key={value} type="button" aria-pressed={scoring === value} onClick={() => setScoring(value)}>{value}</button>)}</div>
          <p className={styles.blurb}>{scoring === "Net" ? "Each player's handicap strokes come off on the hardest holes first. Players enter their handicap when they join." : "Raw strokes, no handicaps."}</p>
        </fieldset>
        <label className={styles.toggle}><span>I&apos;m playing<small>{plays ? "You'll be on the leaderboard and keep your own card" : "You'll run it and watch the leaderboard, but won't play"}</small></span>
          <input type="checkbox" role="switch" checked={plays} onChange={(event) => setPlays(event.target.checked)} /></label>
        {needsHandicap && <label className={styles.field}><span>Your handicap index</span>
          <input inputMode="decimal" placeholder="e.g. 8.4" value={handicap} onChange={(event) => setHandicap(event.target.value)} /></label>}
        <fieldset className={styles.field}><legend>Rounds</legend>
          {rounds.length > 0 && <ol className={own.roundList}>{rounds.map((round, i) => <li key={i}>
            <span><b>Round {i + 1}</b> · {round.setup.course.name}<small>{roundDate(round.date)}{round.setup.tee ? ` · ${round.setup.tee.name} tees` : ""}</small></span>
            <button type="button" className={styles.remove} aria-label={`Remove round ${i + 1}`} onClick={() => setRounds((all) => all.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>
          </li>)}</ol>}
          <button type="button" className={own.addRound} onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> {rounds.length ? "Add another round" : "Add a round"}</button>
        </fieldset>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" className={styles.primary} disabled={!ready || busy}>{busy ? "Creating…" : "Create tournament"} <ArrowRight size={16} aria-hidden="true" /></button>
      </form>
    </section>
  </main>;
}

/** One round: pick the course (search / near me), then its tee and date. Shared with the organizer's Add round later. */
export function AddRound({ onCancel, onAdd, minDate }: { onCancel: () => void; onAdd: (round: NewRound) => void; minDate?: string }) {
  const [picked, setPicked] = useState<CourseResult | null>(null);
  const [course, setCourse] = useState<ScoringCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tee, setTee] = useState(0);
  const [date, setDate] = useState(() => minDate && minDate > today() ? minDate : today());
  useEffect(() => {
    if (!picked) return;
    const controller = new AbortController();
    fetch(`/api/rounds/course/${encodeURIComponent(picked.ref)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ ok: boolean; course?: ScoringCourse; code?: string }>)
      .then((body) => body.ok && body.course && !body.course.custom ? setCourse(body.course)
        : setError(body.code === "no_scorecard" || body.course?.custom ? "This course doesn't have a scorecard on file yet, so it can't be a tournament round. Pick another course." : "Couldn't load this course's scorecard right now."))
      .catch((e: Error) => { if (e.name !== "AbortError") setError("Couldn't reach the course. Check your connection."); });
    return () => controller.abort();
  }, [picked]);
  const back = <header className={styles.header}><button type="button" className={styles.back} onClick={picked ? () => { setPicked(null); setCourse(null); setError(null); } : onCancel} aria-label="Back"><ArrowLeft size={18} aria-hidden="true" /></button><p className={styles.kicker}>Add a round</p></header>;
  if (!picked) return <main className={styles.page}>{back}<div className={styles.search}><ExploreCourseSearch onPick={setPicked} kicker="Round course" title="Where's this round?" /></div></main>;
  // Only the course's own holes (some listings run extra, unlabelled holes past 18).
  const holes = course ? (course.par.length >= 18 ? 18 : course.par.length >= 9 ? 9 : 0) : 0;
  const chosenTee = course?.tees[tee] ?? null;
  return <main className={styles.page}>{back}
    <section className={styles.panel}>
      <h1 className={styles.title}>{picked.name}</h1>
      <p className={styles.place}>{place(picked)}</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : !course ? <p className={styles.note}>Loading the scorecard…</p> : !holes ? <p className={styles.error} role="alert">This course&apos;s scorecard is incomplete. Pick another course.</p>
        : <form className={styles.form} onSubmit={(event) => { event.preventDefault();
            onAdd({ date, setup: { course: { ref: course.ref, name: course.name, place: course.place, par: course.par.slice(0, holes), ...(course.strokeIndex && { strokeIndex: course.strokeIndex.slice(0, holes) }) }, tee: chosenTee } }); }}>
          <p className={styles.blurb}>{holes} holes · Par {course.par.slice(0, holes).reduce((sum, p) => sum + p, 0)}</p>
          <label className={styles.field}><span>Tee box</span>
            {course.tees.length ? <select value={tee} onChange={(event) => setTee(Number(event.target.value))}>
              {course.tees.map((t, i) => <option key={i} value={i}>{t.name}{t.rating != null && t.slope != null ? ` · ${t.rating} / ${t.slope}` : ""}</option>)}
            </select> : <p className={styles.note}>No tee boxes listed for this course.</p>}
          </label>
          <label className={styles.field}><span>Date</span><DatePicker value={date} min={minDate} onChange={(event) => setDate(event.target.value || date)} /></label>
          <button type="submit" className={styles.primary}>Add round <Check size={16} aria-hidden="true" /></button>
        </form>}
    </section>
  </main>;
}

/**
 * After Create, two cards: the code (Copy / Share, for anyone the organizer wants to send it to) and Invite players (a
 * file of names and emails, emailed an invite each). Then into the tournament.
 */
function CodeReady({ name, id, code, net, sample }: { name: string; id: string; code: string; net: boolean; sample: boolean }) {
  const [copied, setCopied] = useState(false);
  const shown = formatCode(code);
  const message = `Join ${name} on The Maroon: open Tourneys and enter code ${shown}`;
  const copy = () => navigator.clipboard?.writeText(shown).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return <main className={styles.page}>
    <div className={own.readyCards}>
      <header className={own.readyHead}><p className={styles.kicker}>Tournament created</p><h1 className={styles.title}>{name}</h1></header>
      <section className={`${styles.panel} ${own.readyCard} ${own.ready}`} aria-label="Tournament code">
        <p className={styles.kicker}>Share the code</p>
        <p className={own.readyCardNote}>Send it to anyone. They open Tourneys, tap Join a Tournament and enter it.</p>
        <p className={`${own.bigCode} ${own.codeSmall}`} aria-label={`Join code ${shown.split("").join(" ")}`}>{shown}</p>
        <div className={own.codeActions}>
          <button type="button" className={styles.secondary} onClick={copy}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? "Copied" : "Copy code"}</button>
          {canShare && <button type="button" className={styles.secondary} onClick={() => navigator.share({ title: name, text: message }).catch(() => {})}><Share2 size={16} aria-hidden="true" /> Share</button>}
        </div>
      </section>
      <InvitePlayersCard id={id} net={net} sample={sample} />
      <Link href={`/tournaments/code/${id}`} className={own.openButton}>Open tournament <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  </main>;
}
