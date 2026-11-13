"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Handshake, Plus } from "lucide-react";
import { AddRound } from "./CodeTournamentCreate";
import { formatCode } from "@/lib/platform/codeTournaments";
import { leagueSection, type LeagueCourse, type LeagueLookup, type LeagueScoring, type MyLeague } from "@/lib/platform/leagues";
import { appHref } from "@/lib/app/appPaths";
import { InviteCodeCard } from "./InviteCodeCard";
import { JoinCodeCard } from "./JoinCodeCard";
import styles from "./PlayRound.module.css";
import own from "./CodeTournament.module.css";
import league from "./League.module.css";

/**
 * Leagues (project_specs.md "Feature: Leagues"): the Leagues tab (my leagues, Create, Join with a code), Create a
 * league, and Join (by code or a shared link). The league itself is LeagueHome.
 */

const today = () => new Date().toLocaleDateString("en-CA");
const handicapValue = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null; };
/** "2026-11-12" → "Thu, Nov 12". */
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
type PostResult = { ok: boolean; id?: string; code?: string; message?: string };
const send = (url: string, body: unknown): Promise<PostResult | null> => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then((r) => r.json() as Promise<PostResult>).catch(() => null);
const problem = (reply: PostResult | null, fallback: string) => reply?.message ?? (reply === null ? "No connection. Try again when you're back online." : fallback);

/** The Leagues tab: Create, Join with a code, then my leagues (Live, Upcoming, Past). */
export function LeaguesHome() {
  const [leagues, setLeagues] = useState<MyLeague[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/leagues", { cache: "no-store" }).then((r) => r.json() as Promise<{ ok: boolean; leagues?: MyLeague[]; code?: string }>)
      .then((body) => body.ok ? setLeagues(body.leagues ?? []) : setError(body.code === "signed_out" ? "Log in to see your leagues." : body.code === "not_installed" ? "Leagues aren't set up in the database yet (supabase/leagues.sql)." : "Couldn't load your leagues. Try again."))
      .catch(() => setError("No connection. Try again when you're back online."));
  }, []);
  const day = today();
  return <main className={styles.page}>
    <section className={styles.panel}>
      <div className={league.homeActions}>
        <Link href="/leagues/new" className={`${styles.primary} ${league.create}`}><Plus size={16} aria-hidden="true" /> Create a league</Link>
        <JoinCodeCard kind="league" />
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p>
        : !leagues ? <p className={styles.note}>Loading your leagues…</p>
        : !leagues.length ? <div className={league.empty}><Handshake size={28} aria-hidden="true" /><p>No leagues yet. Create one, or join with the code from your organizer.</p></div>
        : (["Live", "Upcoming", "Past"] as const).map((section) => {
          const rows = leagues.filter((l) => leagueSection(l, day) === section);
          return rows.length > 0 && <section key={section} aria-label={section}>
            <h2 className={league.heading}>{section}</h2>
            <ul className={league.leagueList}>{rows.map((l) => <li key={l.id}><Link href={appHref(`/leagues/${l.id}`)}>
              <span><strong>{l.name}</strong><small>{l.course} · {dayLabel(l.date)} · {l.playerCount} {l.playerCount === 1 ? "player" : "players"}</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link></li>)}</ul>
          </section>;
        })}
    </section>
  </main>;
}

/** Create a league: course and date (course search → tee), then name, Gross / Net and whether I'm playing. */
export function LeagueCreate() {
  const [picked, setPicked] = useState<{ course: LeagueCourse; date: string } | null>(null);
  const [choosing, setChoosing] = useState(true);
  const [name, setName] = useState("");
  const [scoring, setScoring] = useState<LeagueScoring>("Gross");
  const [plays, setPlays] = useState(true);
  const [handicap, setHandicap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; code: string } | null>(null);

  if (made) return <LeagueReady name={name.trim()} id={made.id} code={made.code} />;
  if (choosing) return <AddRound labels={{ kicker: "Create a league", title: "Where are you playing?", button: "Use this course" }}
    onCancel={() => picked ? setChoosing(false) : history.back()}
    onAdd={({ setup, date }) => {
      // Skins and the pairs game are played over 18 holes.
      if (setup.course.par.length !== 18) { setError("Leagues need an 18-hole course. Pick another course."); return; }
      setError(null);
      setPicked({ date, course: { ref: setup.course.ref, name: setup.course.name, place: setup.course.place || null, par: setup.course.par,
        strokeIndex: setup.course.strokeIndex && setup.course.strokeIndex.every((s): s is number => typeof s === "number") ? setup.course.strokeIndex : null, tee: setup.tee } });
      setChoosing(false);
    }} />;
  const ready = name.trim().length > 0 && picked && (!plays || !handicap || handicapValue(handicap) !== null);

  async function create() {
    if (!ready || !picked) return;
    setBusy(true); setError(null);
    const reply = await send("/api/leagues", { name: name.trim(), course: picked.course, date: picked.date, scoring, plays, handicap: plays ? handicapValue(handicap) : null });
    setBusy(false);
    if (reply?.ok && reply.id && reply.code) { setMade({ id: reply.id, code: reply.code }); return; }
    setError(problem(reply, "Couldn't create the league. Try again."));
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/leagues" className={styles.back} aria-label="Back to Leagues"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Create a league</p></header>
    <section className={styles.panel}>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className={styles.field}><span>League name</span>
          <input value={name} maxLength={60} placeholder="e.g. Thursday Night League" onChange={(e) => setName(e.target.value)} /></label>
        <div className={styles.field}><span>Course</span>
          <button type="button" className={styles.gameButton} onClick={() => setChoosing(true)}>{picked?.course.name}<small>{picked && `${dayLabel(picked.date)}${picked.course.tee ? ` · ${picked.course.tee.name} tees` : ""}`}</small></button></div>
        <fieldset className={styles.field}><legend>Leaderboard</legend>
          <div className={styles.choices}>{(["Gross", "Net"] as const).map((value) =>
            <button key={value} type="button" aria-pressed={scoring === value} onClick={() => setScoring(value)}>{value}</button>)}</div>
          <p className={styles.blurb}>{scoring === "Net" ? "Each player's handicap strokes come off on the hardest holes first." : "Raw strokes, no handicaps."} You can change it later.</p>
        </fieldset>
        <label className={styles.toggle}><span>I&apos;m playing<small>{plays ? "You'll be on the leaderboard" : "You'll run it, but won't play"}</small></span>
          <input type="checkbox" role="switch" checked={plays} onChange={(e) => setPlays(e.target.checked)} /></label>
        {plays && <label className={styles.field}><span>Your handicap index</span>
          <input inputMode="decimal" placeholder="e.g. 8.4" value={handicap} onChange={(e) => setHandicap(e.target.value)} />
          <small className={styles.blurb}>Used for anything net: the leaderboard, skins, pairs and group games.</small></label>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" className={styles.primary} disabled={!ready || busy}>{busy ? "Creating…" : "Create league"} <ArrowRight size={16} aria-hidden="true" /></button>
      </form>
    </section>
  </main>;
}

/** After Create: the invite card (Copy, Share, Email the code), then into the league. */
export function LeagueReady({ name, id, code }: { name: string; id: string; code: string }) {
  return <main className={styles.page}>
    <div className={own.readyCards}>
      <header className={own.readyHead}><p className={styles.kicker}>League created</p><h1 className={styles.title}>{name}</h1></header>
      <InviteCodeCard kind="league" id={id} code={code} name={name} canEmail />
      <Link href={appHref(`/leagues/${id}`)} className={own.openButton}>Open league <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  </main>;
}

type Look = { status: "loading" } | { status: "found"; l: LeagueLookup } | { status: "missing" } | { status: "error"; message: string };

/** Join a league by code (from the Leagues tab, or a shared link /leagues/join?code=…): what it is, my handicap, Join. */
export function LeagueJoin({ code }: { code: string }) {
  const router = useRouter();
  const [look, setLook] = useState<Look>({ status: "loading" });
  const [handicap, setHandicap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/leagues/lookup?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; league?: LeagueLookup | null; code?: string }>)
      .then((body) => setLook(body.ok ? body.league ? { status: "found", l: body.league } : { status: "missing" }
        : { status: "error", message: body.code === "not_installed" ? "Leagues aren't set up in the database yet." : "Couldn't look up that code. Try again." }))
      .catch(() => setLook({ status: "error", message: "No connection. Try again when you're back online." }));
  }, [code]);

  async function join(l: LeagueLookup) {
    setBusy(true); setError(null);
    const reply = await send("/api/leagues/join", { code, handicap: handicapValue(handicap) });
    setBusy(false);
    if (reply?.ok && reply.id) { router.push(appHref(`/leagues/${reply.id}`)); return; }
    setError(problem(reply, `Couldn't join ${l.name}. Try again.`));
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/leagues" className={styles.back} aria-label="Back to Leagues"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Join with code · {formatCode(code)}</p></header>
    <section className={styles.panel}>
      {look.status === "loading" ? <p className={styles.note}>Looking up the code…</p>
        : look.status === "missing" ? <><p className={styles.error} role="alert">No league has the code {formatCode(code)}. Check it with your organizer and try again.</p><Link href="/leagues" className={styles.secondary}>Try another code</Link></>
        : look.status === "error" ? <p className={styles.error} role="alert">{look.message}</p>
        : <><h1 className={styles.title}>{look.l.name}</h1>
          <p className={styles.place}>{look.l.course} · {dayLabel(look.l.date)} · Organized by {look.l.organizerName} · {look.l.playerCount} {look.l.playerCount === 1 ? "player" : "players"}</p>
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void join(look.l); }}>
            {look.l.member ? <Link href={appHref(`/leagues/${look.l.id}`)} className={styles.primary}>You&apos;re in. Open league <ArrowRight size={16} aria-hidden="true" /></Link>
              : look.l.status === "ended" ? <p className={styles.error} role="alert">This league has ended.</p>
              : <>
                <label className={styles.field}><span>Your handicap index</span>
                  <input inputMode="decimal" placeholder="e.g. 12.3" value={handicap} onChange={(e) => setHandicap(e.target.value)} />
                  <small className={styles.blurb}>Used for anything net. Leave it blank if you don&apos;t have one.</small></label>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button type="submit" className={styles.primary} disabled={busy || (handicap.trim() !== "" && handicapValue(handicap) === null)}>{busy ? "Joining…" : "Join league"} <ArrowRight size={16} aria-hidden="true" /></button>
              </>}
          </form></>}
    </section>
  </main>;
}

/** /leagues/join?code=…: Join for that code (a shared link, or the Leagues tab's code box); no code → back to Leagues. */
export function LeagueJoinPage() {
  return <Suspense><JoinFromQuery /></Suspense>;
}
function JoinFromQuery() {
  const code = (useSearchParams().get("code") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (code.length !== 6) return <main className={styles.page}>
    <header className={styles.header}><Link href="/leagues" className={styles.back} aria-label="Back to Leagues"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Join a league</p></header>
    <section className={styles.panel}><p className={styles.error} role="alert">That link is missing its code. Enter the code on the Leagues tab.</p><Link href="/leagues" className={styles.secondary}>Go to Leagues</Link></section>
  </main>;
  return <LeagueJoin code={code} />;
}
