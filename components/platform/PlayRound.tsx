"use client";

import { DatePicker } from "@/components/platform/DatePicker";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Settings as SettingsIcon, X } from "lucide-react";
import { CourseSearchBar } from "./TripScheduleCoursePicker";
import wiz from "./CreateTournament.module.css";
import { GolfTripScoring } from "./GolfTripScoring";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import gamesStyles from "./GolfTripGames.module.css";
import { InviteCodeCard } from "./InviteCodeCard";
import { customCourse, holeRange, type HolesChoice, type PersonalRoundSetup, type RoundGuest, type RoundPlayer, type ScoringCourse } from "@/lib/platform/personalRound";
import { guestStrokes } from "@/lib/platform/sharedRoundCards";
import { sideGameMoney, sideGamesOn, type SideGames } from "@/lib/platform/sideGames";
import { customRef, isCustomRef } from "@/lib/platform/golfGps/courseRefs";
import { gameDef, moneyByHole, scoreGame, stakeUnit, wolfFor, type GameConfig, type GameId, type GameResult, type HoleInput } from "@/lib/platform/roundGames";
import type { PlayerRound, ScoredCard, ShotResult } from "@/lib/platform/playerRounds";
import type { SheetCard } from "@/lib/platform/liveCards";
import type { SharedRound } from "@/lib/platform/sharedRoundsServer";
import styles from "./PlayRound.module.css";
import trip from "./GolfTripMatch.module.css";
import { AppSelect } from "@/components/platform/AppSelect";

/** The round in progress, kept on this phone so a refresh or closed app doesn't lose it. `sharedId` = an invite round in the database. */
const STORAGE_KEY = "maroonPersonalRound";
type Saved = { setup: PersonalRoundSetup; startedAt: string; card?: SheetCard; inputs?: HoleInput[]; sharedId?: string; openedAt?: string };
/** `members`: the host's submit also saved these joined players' rounds (or couldn't, when a hole wasn't scored). */
type MemberSave = { name: string; saved: boolean };
type SaveState = { status: "idle" | "saving" } | { status: "saved"; round: PlayerRound; game: GameResult | null; members?: MemberSave[] } | { status: "error"; message: string };
type Player = SharedRound["players"][number];
/** A random order (Fisher–Yates), for Randomize on the playing order. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const newGuestId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** How often every phone in a shared round checks for the others' scores. */
const POLL_MS = 4000;

const today = () => new Date().toLocaleDateString("en-CA");
const parse = (text: string | null): Saved | null => { try { return JSON.parse(text ?? "null"); } catch { return null; } };
const storedText = () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };
const read = () => parse(storedText());
const subscribeNever = () => () => {};
const write = (value: Saved | null) => { try { if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); else localStorage.removeItem(STORAGE_KEY); } catch { /* private mode: keep it in memory */ } };
/** Saves part of the round in progress, keeping whatever else is already saved. */
const update = (base: Saved, part: Partial<Saved>) => write({ ...(read() ?? base), ...part });
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const handicapValue = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null; };
const holesLabel = (holes: HolesChoice) => holes === "18" ? "18 holes" : holes === "front" ? "Front 9" : "Back 9";
/** "2–5 players", "2 or 4 players", "5 players". */
export const playersLabel = (sizes: number[]) => sizes.length === 1 ? `${sizes[0]} players` : sizes.every((n, i) => i === 0 || n === sizes[i - 1] + 1) ? `${sizes[0]}–${sizes.at(-1)} players` : `${sizes.slice(0, -1).join(", ")} or ${sizes.at(-1)} players`;
/** The game picker's groups, as in the trip's New game sheet. */
const GAME_GROUPS: { title: string; ids: GameId[] }[] = [
  { title: "Points games", ids: ["skins", "wolf", "daytona", "vegas", "sixes", "nines", "bbb", "stableford"] },
  { title: "Match & stroke play", ids: ["stroke", "match", "nassau", "bestball", "snake"] },
  { title: "Team formats (don't count toward handicap)", ids: ["scramble", "shamble", "alternate", "chapman"] },
];
type PostResult = { ok: boolean; code?: string; message?: string; id?: string };
const post = (url: string, body: unknown): Promise<PostResult> => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ ...(await r.json().catch(() => ({}))) as PostResult, ok: r.ok }))
  .catch(() => ({ ok: false, code: "offline" }));
const sharedUrl = (id: string) => `/api/rounds/shared/${encodeURIComponent(id)}`;
/** Scorecards players built on courses with none on file, by course ref, so the next round there starts with those pars. */
const BUILT_KEY = "maroonBuiltCourses";
const builtPars = (ref: string): number[] | undefined => { try { return (JSON.parse(localStorage.getItem(BUILT_KEY) ?? "{}") as Record<string, number[]>)[ref]; } catch { return undefined; } };
const saveBuiltPars = (ref: string, par: number[]) => { try { localStorage.setItem(BUILT_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(BUILT_KEY) ?? "{}"), [ref]: par })); } catch { /* private mode */ } };
const withPar = (setup: PersonalRoundSetup, hole: number, value: number): PersonalRoundSetup => ({ ...setup, course: { ...setup.course, par: setup.course.par.map((p, h) => h === hole ? value : p) } });

/**
 * Play a round (/rounds/new): round setup (4 pages: round, players, game, review) → the trip's scoring screen → Submit &
 * Save to Profile → Rounds. The round lives in the database; the host keeps score and joined players watch it live.
 * `openRound` (?round=<id>) opens a shared round, e.g. after Join on the Play page.
 */
export function PlayRound({ openRound }: { openRound?: string }) {
  // A round in progress on this phone (undefined while rendering on the server); starting / discarding overrides it.
  const stored = useSyncExternalStore(subscribeNever, storedText, () => undefined);
  const [override, setRound] = useState<Saved | null | undefined>(undefined);
  if (stored === undefined) return <main className={styles.page} />;
  const round = override !== undefined ? override : parse(stored);
  const header = <header className={styles.header}><Link href="/" className={styles.back} aria-label="Back to Play"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Play a round</p></header>
  const open = (next: Saved) => { write(next); setRound(next); };
  // Joining from an invite (or another phone): load that shared round onto this phone.
  if (openRound && round?.sharedId !== openRound) return <OpenShared id={openRound} header={header} onOpen={open} />;
  // An unfinished round from earlier: ask before going back into it.
  if (round && override === undefined && !openRound) return <main className={styles.page}>
    {header}
    <section className={styles.panel}>
      <h1 className={styles.title}>Unfinished round</h1>
      <p className={styles.place}>{round.setup.course.name} · started {new Date(round.openedAt ?? round.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{round.sharedId ? " · with friends" : ""}</p>
      <div className={styles.saved}>
        <button type="button" className={styles.primary} onClick={() => setRound(round)}>Pick up where I left off <ArrowRight size={16} aria-hidden="true" /></button>
        <button type="button" className={styles.secondary} onClick={() => { if (window.confirm(round.sharedId ? "Start a new round? You'll leave the round with friends on this phone." : "Start a new round? The unfinished round will be deleted.")) { write(null); setRound(null); } }}>Start a new round</button>
      </div>
    </section>
  </main>;
  const leave = () => { write(null); setRound(null); };
  if (round?.sharedId) return <SharedPlayStep saved={round} />;
  if (round) return <PlayStep saved={round} onDiscard={leave} />;
  return <SetupStep onStart={open} />;
}

/** A live round with friends on another phone (or this one after a cleared browser): offer to rejoin it here. */
function LiveRoundBanner() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/rounds/shared", { cache: "no-store" }).then((r) => r.json() as Promise<{ ok: boolean; id?: string | null }>)
      .then((body) => setId(body.ok && body.id ? body.id : null)).catch(() => { /* nothing to offer */ });
  }, []);
  if (!id) return null;
  return <div className={styles.panel}><Link href={`/rounds/new?round=${id}`} className={styles.banner}>You have a round with friends in progress. <b>Rejoin <ArrowRight size={14} aria-hidden="true" /></b></Link></div>;
}

function OpenShared({ id, header, onOpen }: { id: string; header: ReactNode; onOpen: (saved: Saved) => void }) {
  const [error, setError] = useState<string | null>(null);
  const opened = useRef(false);
  const openRef = useRef(onOpen);
  useEffect(() => { openRef.current = onOpen; }, [onOpen]);
  useEffect(() => {
    fetch(sharedUrl(id), { cache: "no-store" }).then((r) => r.json() as Promise<{ ok: boolean; round?: SharedRound; code?: string }>).then((body) => {
      if (body.ok && body.round) {
        if (!opened.current) { opened.current = true; openRef.current({ setup: body.round.setup, startedAt: body.round.id, sharedId: body.round.id, openedAt: body.round.startedAt }); }
        return;
      }
      setError(body.code === "not_in_round" ? "You're not in this round (the invite may have been cancelled)." : "Couldn't open the round. Try again in a moment.");
    }).catch(() => setError("No connection. Try again when you're back online."));
  }, [id]);
  return <main className={styles.page}>{header}<section className={styles.panel}>
    {error ? <><p className={styles.error} role="alert">{error}</p><Link href="/" className={styles.secondary}>Back to Play</Link></> : <p className={styles.note}>Opening the round…</p>}
  </section></main>;
}

/** The round setup's pages (owner layout 2026-11-21), in the trip builder's look. */
const SETUP_PAGES = ["round", "players", "game", "review"] as const;
type SetupPage = typeof SETUP_PAGES[number];
const PAGE_TITLES: Record<SetupPage, string> = { round: "Your round", players: "Who's playing?", game: "The game", review: "Ready to tee off?" };
type PickedRoundCourse = { ref: string; name: string; place: string };
const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n) % 1 ? Math.abs(n).toFixed(2) : Math.abs(n)}`;
const dollars = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n > 0 && n <= 10000 ? Math.round(n * 100) / 100 : 0; };

/**
 * Round setup, 4 pages like the trip builder: 1) the round — course (our library → GolfCourseAPI → add by hand), tees,
 * holes, date, Track stats, Count toward handicap · 2) players (friends with the app, guests) · 3) the game and its
 * options (stakes, birdies double, eagles triple, carryovers, handicaps, Nassau presses) · 4) review → Start. Every
 * round starts in the database, so it always has a code to share (supabase/join_codes.sql).
 */
function SetupStep({ onStart }: { onStart: (saved: Saved) => void }) {
  const [page, setPage] = useState<SetupPage>("round");
  const [picked, setPicked] = useState<PickedRoundCourse | null>(null);
  const [course, setCourse] = useState<ScoringCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tee, setTee] = useState(0);
  const [holes, setHoles] = useState<HolesChoice>("18");
  const [stats, setStats] = useState(true);
  const [countForHandicap, setCount] = useState(true);
  const [datePlayed, setDate] = useState(today);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [guests, setGuests] = useState<RoundGuest[]>([]);
  const [myHandicap, setMyHandicap] = useState("");
  const [gameId, setGameId] = useState<GameId | "">("");
  const [net, setNet] = useState(false);
  const [allowance, setAllowance] = useState(100);
  const [birdiesDouble, setBirdiesDouble] = useState(false);
  const [eaglesTriple, setEaglesTriple] = useState(false);
  const [carryovers, setCarryovers] = useState(true);
  const [stake, setStake] = useState("");
  const [nassau, setNassau] = useState(["", "", ""]);
  const [autoPress, setAutoPress] = useState(false);
  // On by default for points games (owner: the Double bet button should be there); the toggle turns it off.
  const [doubles, setDoubles] = useState(true);
  // Side games: on / off, $ each, and the holes for longest drive / closest to the pin (1-based; suggested once a course loads).
  const [greenies, setGreenies] = useState({ on: false, value: "" });
  const [longest, setLongest] = useState<{ on: boolean; value: string; holes: number[] | null }>({ on: false, value: "", holes: null });
  const [closest, setClosest] = useState<{ on: boolean; value: string; holes: number[] | null }>({ on: false, value: "", holes: null });
  const [teams, setTeams] = useState<number[]>([]);
  const [pickingGame, setPickingGame] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");

  function pick(next: PickedRoundCourse) {
    setPicked(next); setTee(0); setError(null);
    // A course added by hand has no scorecard on file: build it while playing (pars remembered by name on this phone).
    if (isCustomRef(next.ref)) { setCourse(customCourse(next.ref, next.name, next.place, builtPars(next.ref))); return; }
    setCourse(null);
    fetch(`/api/rounds/course/${encodeURIComponent(next.ref)}`)
      .then((response) => response.json() as Promise<{ ok: boolean; course?: ScoringCourse; code?: string }>)
      .then((body) => body.ok && body.course ? setCourse(body.course)
        : setError(body.code === "no_scorecard" ? "This course doesn't have a scorecard on file yet." : "Couldn't load this course's scorecard right now."))
      .catch(() => setError("Couldn't reach the course. Check your connection."));
  }

  // A built scorecard has no tees on file: an optional rating / slope from the course's own card lets the round count.
  const ratingValue = Number.parseFloat(rating), slopeValue = Number.parseInt(slope, 10);
  const customTee = ratingValue >= 20 && ratingValue <= 90 && slopeValue >= 55 && slopeValue <= 155 ? { name: "From the scorecard", rating: ratingValue, slope: slopeValue } : null;
  const chosenTee = course?.custom ? customTee : course?.tees[tee] ?? null;
  const rated = chosenTee?.rating != null && chosenTee.slope != null;
  const size = players.length + guests.length + 1;
  const def = gameId ? gameDef(gameId) : null;
  const fits = !def || def.players.includes(size);
  const teamOf = (i: number) => teams[i] ?? (i < size / 2 ? 0 : 1);
  const teamFormat = def?.teamFormat ?? false;
  const names = ["You", ...players.map((p) => p.name), ...guests.map((g) => g.name)];
  const handicapNote = !countForHandicap ? "Practice round: saved, not counted" : teamFormat ? "Team formats can't count toward a handicap"
    : !rated ? course?.custom ? "Add the course rating and slope for it to count" : "This tee has no rating, so it won't count" : holes !== "18" ? "9-hole rounds are saved but don't count yet" : "Counts once you submit";
  const nassauStakes = nassau.map(dollars) as [number, number, number];
  const game: GameConfig | null = def ? {
    id: def.id, net: net && !def.teamFormat, birdiesDouble: def.points && birdiesDouble,
    ...(def.points && eaglesTriple ? { eaglesTriple: true } : {}),
    ...(net && !def.teamFormat && allowance !== 100 ? { allowance } : {}),
    ...(def.id === "skins" && !carryovers ? { carryovers: false } : {}),
    ...(def.id === "nassau" ? (nassauStakes.some(Boolean) ? { nassauStakes } : {}) : dollars(stake) ? { stake: dollars(stake) } : {}),
    ...(def.id === "nassau" && autoPress ? { autoPress: true } : {}),
    ...(def.points && doubles ? { doubles: true } : {}),
    ...(def.teams ? { teams: names.map((_, i) => teamOf(i)) } : {}),
  } : null;
  const holesOfPar = (pars: number[]) => course ? course.par.flatMap((p, i) => pars.includes(p) && i >= holeRange(holes)[0] && i < holeRange(holes)[1] ? [i + 1] : []) : [];
  const longestHoles = longest.holes ?? holesOfPar([5]);
  const closestHoles = closest.holes ?? holesOfPar([3]);
  const sideGames: SideGames = {
    ...(greenies.on ? { greenies: { value: dollars(greenies.value) } } : {}),
    ...(longest.on && longestHoles.length ? { longestDrive: { value: dollars(longest.value), holes: longestHoles } } : {}),
    ...(closest.on && closestHoles.length ? { closestPin: { value: dollars(closest.value), holes: closestHoles } } : {}),
  };
  const setup: PersonalRoundSetup | null = course ? { course, tee: chosenTee, holes, stats, countForHandicap: countForHandicap && !teamFormat, datePlayed, players,
    myHandicap: handicapValue(myHandicap), game, ...(guests.length ? { guests } : {}), ...(stats ? { playerStats: true } : {}),
    ...(Object.keys(sideGames).length ? { sideGames } : {}) } : null;

  async function start() {
    if (!setup) return;
    setStarting(true); setStartError(null);
    // Every round starts in the database, so there's always a code to share and friends can join any time.
    const result = await post("/api/rounds/shared", { setup, invites: players.map((p) => p.profileId) });
    setStarting(false);
    if (result.ok && result.id) { onStart({ setup, startedAt: result.id, sharedId: result.id, openedAt: new Date().toISOString() }); return; }
    // Shared rounds not set up in this database yet: a round on my own still works (kept on this phone).
    if (result.code === "not_installed" && !players.length && !guests.length) { onStart({ setup, startedAt: new Date().toISOString() }); return; }
    setStartError(result.code === "signed_out" ? "signed_out" : result.message ?? (result.code === "offline" ? "No connection. Check your internet and try again." : "Couldn't start the round. Try again."));
  }

  const at = SETUP_PAGES.indexOf(page);
  const canNext = page === "round" ? Boolean(course) : page === "game" ? fits : true;
  const toggle = (label: string, note: string | null, checked: boolean, onChange: (value: boolean) => void, disabled = false) =>
    <label className={`${styles.wizToggle} ${disabled ? styles.toggleOff : ""}`}><span>{label}{note && <small>{note}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
  const choices = <T extends string | number,>(label: string, value: T, options: [T, string][], onChange: (value: T) => void) =>
    <fieldset className={styles.wizChoices}><legend>{label}</legend>
      <div>{options.map(([v, text]) => <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}</div>
    </fieldset>;
  const stakeField = (label: string, value: string, onChange: (text: string) => void) =>
    <label className={wiz.field}><span className={wiz.fieldLabel}>{label}</span>
      <input className={wiz.input} inputMode="decimal" placeholder="$0" value={value} onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))} /></label>;

  return <main className={wiz.wizard}>
    <section className={`${wiz.wizardBody} ${styles.setup}`} aria-label="Round setup">
      <div className={wiz.wizardProgress} aria-hidden="true"><span style={{ width: `${((at + 1) / SETUP_PAGES.length) * 100}%` }} /></div>
      <h1 className={wiz.wizardTitle}>{PAGE_TITLES[page]}</h1>
      <div className={wiz.fields}>
        {page === "round" && <>
          {!picked && <LiveRoundBanner />}
          {picked ? <div className={styles.pickedCourse}>
            <span><strong>{picked.name}</strong>{picked.place && <small>{picked.place}</small>}</span>
            <button type="button" onClick={() => { setPicked(null); setCourse(null); setError(null); }}>Change</button>
          </div> : <div className={styles.courseSearch}>
            <CourseSearchBar roundLabel="your round" autoFocus onPick={(c) => pick({ ref: c.ref, name: c.name, place: c.place })}
              onUseTyped={(name) => pick({ ref: customRef(name), name, place: "" })} />
          </div>}
          {picked && error && <div className={styles.saved}>
            <p className={styles.note}>{error}</p>
            <button type="button" className={wiz.continue} onClick={() => { setCourse(customCourse(picked.ref, picked.name, picked.place, builtPars(picked.ref))); setError(null); }}>Build the scorecard as I play</button>
          </div>}
          {picked && !course && !error && <p className={styles.note}>Loading the scorecard…</p>}
          {course && <>
            {course.custom ? <>
              <p className={styles.blurb}>{course.par.some((p) => p !== 4) ? "Pars from your last round here. " : "Every hole starts at par 4. "}Tap Par on the scoring screen to change a hole.</p>
              <div className={styles.ratingRow}>
                <label className={wiz.field}><span className={wiz.fieldLabel}>Course rating</span><input className={wiz.input} inputMode="decimal" placeholder="e.g. 71.2" value={rating} onChange={(event) => setRating(event.target.value)} /></label>
                <label className={wiz.field}><span className={wiz.fieldLabel}>Slope</span><input className={wiz.input} inputMode="numeric" placeholder="e.g. 125" value={slope} onChange={(event) => setSlope(event.target.value)} /></label>
              </div>
            </> : course.tees.length ? <label className={wiz.field}><span className={wiz.fieldLabel}>Tees</span>
              <AppSelect value={tee} onChange={(event) => setTee(Number(event.target.value))}>
                {course.tees.map((t, i) => <option key={i} value={i}>{t.name}{t.rating != null && t.slope != null ? ` · ${t.rating} / ${t.slope}` : " · no rating"}</option>)}
              </AppSelect></label> : <p className={styles.note}>No tees listed for this course.</p>}
            {choices("Holes", holes, [["18", "18 holes"], ["front", "Front 9"], ["back", "Back 9"]], setHoles)}
            <label className={wiz.field}><span className={wiz.fieldLabel}>Date</span><DatePicker value={datePlayed} max={today()} onChange={(event) => setDate(event.target.value || today())} /></label>
            {toggle("Track stats", "Putts, fairways, greens", stats, setStats)}
            {toggle("Count toward handicap", handicapNote, countForHandicap && !teamFormat, setCount, teamFormat)}
          </>}
        </>}

        {page === "players" && <>
          <ul className={styles.players}>
            <li><span>You<small>Scorekeeper</small></span></li>
            {players.map((player, i) => <li key={player.profileId ?? i}><span>{player.name}<small>Gets an invite in the app</small></span>
              <button type="button" className={styles.remove} aria-label={`Don't invite ${player.name}`} onClick={() => { setPlayers((all) => all.filter((_, j) => j !== i)); setTeams([]); }}><X size={16} aria-hidden="true" /></button></li>)}
            {guests.map((guest, i) => <li key={guest.id}><span>{guest.name}<small>Guest · you keep their score</small></span>
              <button type="button" className={styles.remove} aria-label={`Remove ${guest.name}`} onClick={() => { setGuests((all) => all.filter((_, j) => j !== i)); setTeams([]); }}><X size={16} aria-hidden="true" /></button></li>)}
          </ul>
          {size < 5 ? <>
            <InvitePlayer taken={players.flatMap((p) => p.profileId ? [p.profileId] : [])} onInvite={(player) => { setPlayers((all) => [...all, player]); setTeams([]); }} />
            <AddGuest onAdd={(name) => { setGuests((all) => [...all, { id: newGuestId(), name, handicap: null }]); setTeams([]); }} />
          </> : <p className={styles.note}>A round has up to 5 players.</p>}
          <p className={styles.blurb}>You keep score for everyone. Once you start, you&apos;ll get a code to send so anyone with the app can join and follow along.</p>
        </>}

        {page === "game" && <>
          <GamePicker gameId={def?.id ?? ""} onPick={(id) => { setGameId(id); setTeams([]); }} open={pickingGame} setOpen={setPickingGame} />
          {def && <p className={styles.blurb}>{def.blurb}</p>}
          {def && !fits && <p className={styles.needs} role="status">{def.name} needs {playersLabel(def.players)}. You have {size}: go Back to change who&apos;s playing, or pick another game.</p>}
          {fits && def?.teams && size > 2 && <div className={styles.teams} role="group" aria-label="Teams">
            {names.map((name, i) => <button key={i} type="button" aria-pressed={teamOf(i) === 1} onClick={() => setTeams(names.map((_, j) => j === i ? 1 - teamOf(j) : teamOf(j)))}>
              {firstName(name)} <b>{teamOf(i) === 0 ? "Team 1" : "Team 2"}</b></button>)}
          </div>}
          {def && def.id === "nassau" && <>
            <div className={styles.stakeRow}>{stakeField("Front 9", nassau[0], (t) => setNassau([t, nassau[1], nassau[2]]))}{stakeField("Back 9", nassau[1], (t) => setNassau([nassau[0], t, nassau[2]]))}{stakeField("Overall", nassau[2], (t) => setNassau([nassau[0], nassau[1], t]))}</div>
            {toggle("Automatic presses", "A new bet when a side goes 2 down on a nine", autoPress, setAutoPress)}
          </>}
          {def && def.id !== "nassau" && !def.teamFormat && stakeField(`$ per ${stakeUnit(def.id)} (optional)`, stake, setStake)}
          {def?.points && toggle("Birdies double", null, birdiesDouble, setBirdiesDouble)}
          {def?.points && toggle("Eagles triple", null, eaglesTriple, setEaglesTriple)}
          {def?.id === "skins" && toggle("Carryovers", "Tied holes carry to the next", carryovers, setCarryovers)}
          {def?.points && toggle("Allow doubles", "A Double bet button on each hole", doubles, setDoubles)}
          {def && !def.teamFormat && toggle("Use handicaps (net)", null, net, setNet)}
          {def && net && !def.teamFormat && <>
            {choices("Handicap allowance", allowance, [[100, "100%"], [90, "90%"], [80, "80%"]], setAllowance)}
            <ul className={styles.players}>
              <li><span>You</span><HandicapInput value={myHandicap} onChange={setMyHandicap} label="Your handicap" /></li>
              {players.map((p, i) => <li key={p.profileId ?? i}><span>{p.name}</span><HandicapInput value={p.handicap?.toString() ?? ""} onChange={(text) => setPlayers((all) => all.map((x, j) => j === i ? { ...x, handicap: handicapValue(text) } : x))} label={`${p.name}'s handicap`} /></li>)}
              {guests.map((g, i) => <li key={g.id}><span>{g.name}</span><HandicapInput value={g.handicap?.toString() ?? ""} onChange={(text) => setGuests((all) => all.map((x, j) => j === i ? { ...x, handicap: handicapValue(text) } : x))} label={`${g.name}'s handicap`} /></li>)}
            </ul>
          </>}
          <p className={wiz.sectionTitle}>Side games</p>
          {toggle("Greenies", "On every par 3", greenies.on, (on) => setGreenies({ ...greenies, on }))}
          {greenies.on && stakeField("$ per greenie (optional)", greenies.value, (value) => setGreenies({ ...greenies, value }))}
          {toggle("Longest drive", null, longest.on, (on) => setLongest({ ...longest, on }))}
          {longest.on && <>{stakeField("$ per longest drive (optional)", longest.value, (value) => setLongest({ ...longest, value }))}
            <HolePicker label="Longest drive holes" par={course?.par ?? []} range={holeRange(holes)} selected={longestHoles} onChange={(next) => setLongest({ ...longest, holes: next })} /></>}
          {toggle("Closest to the pin", null, closest.on, (on) => setClosest({ ...closest, on }))}
          {closest.on && <>{stakeField("$ per closest to the pin (optional)", closest.value, (value) => setClosest({ ...closest, value }))}
            <HolePicker label="Closest to the pin holes" par={course?.par ?? []} range={holeRange(holes)} selected={closestHoles} onChange={(next) => setClosest({ ...closest, holes: next })} /></>}
          {!def && <p className={styles.blurb}>Optional. Skip it to just keep score.</p>}
          {def && <p className={styles.blurb}>Money is only shown in the standings. Nothing is paid in the app.</p>}
        </>}

        {page === "review" && setup && <dl className={styles.review}>
          <div><dt>Course</dt><dd>{setup.course.name}{chosenTee ? ` · ${chosenTee.name}` : ""}</dd></div>
          <div><dt>Round</dt><dd>{[holesLabel(holes), new Date(`${datePlayed}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }), stats ? "Stats on" : null, setup.countForHandicap ? "Counts" : "Practice"].filter(Boolean).join(" · ")}</dd></div>
          <div><dt>Players</dt><dd>{names.join(", ")}</dd></div>
          <div><dt>Game</dt><dd>{def ? [def.name, game?.stake ? `${money(game.stake).slice(1)} per ${stakeUnit(def.id)}` : null, game?.nassauStakes ? `$${game.nassauStakes.join(" / $")}` : null,
            game?.autoPress ? "presses" : null, game?.birdiesDouble ? "birdies ×2" : null, game?.eaglesTriple ? "eagles ×3" : null, game?.carryovers === false ? "no carryovers" : null, game?.doubles ? "doubles" : null,
            game?.net ? `net ${allowance}%` : null].filter(Boolean).join(" · ") : "Just keeping score"}</dd></div>
          {setup.sideGames && <div><dt>Side games</dt><dd>{[
            setup.sideGames.greenies ? `Greenies${setup.sideGames.greenies.value ? ` $${setup.sideGames.greenies.value}` : ""}` : null,
            setup.sideGames.longestDrive ? `Longest drive${setup.sideGames.longestDrive.value ? ` $${setup.sideGames.longestDrive.value}` : ""} (${setup.sideGames.longestDrive.holes.join(", ")})` : null,
            setup.sideGames.closestPin ? `Closest to the pin${setup.sideGames.closestPin.value ? ` $${setup.sideGames.closestPin.value}` : ""} (${setup.sideGames.closestPin.holes.join(", ")})` : null,
          ].filter(Boolean).join(" · ")}</dd></div>}
        </dl>}
        {startError === "signed_out" ? <p className={styles.error} role="alert">Log in to start a round. <Link href="/login?next=/rounds/new">Log in</Link></p>
          : startError && <p className={styles.error} role="alert">{startError}</p>}
      </div>
      <div className={wiz.stepButtons}>
        {at === 0 ? <Link href="/" className={wiz.back}>Back</Link> : <button type="button" className={wiz.back} onClick={() => setPage(SETUP_PAGES[at - 1])}>Back</button>}
        {page === "review"
          ? <button type="button" className={`${wiz.continue} ${wiz.start}`} disabled={starting || !setup} onClick={() => void start()}>{starting ? "Starting…" : "Start round"}</button>
          : <button type="button" className={`${wiz.continue} ${wiz.start}`} disabled={!canNext} onClick={() => setPage(SETUP_PAGES[at + 1])}>Next</button>}
      </div>
    </section>
  </main>;
}

/** "Choose a game" button + the trip-style game sheet (also a league group's game, LeagueHome). */
export function GamePicker({ gameId, onPick, open, setOpen }: { gameId: GameId | ""; onPick: (id: GameId | "") => void; open: boolean; setOpen: (open: boolean) => void }) {
  const def = gameId ? gameDef(gameId) : null;
  return <>
    <div className={styles.gamePick}>
      <button type="button" className={styles.gameButton} aria-haspopup="dialog" onClick={() => setOpen(true)}>{def ? def.name : "Choose a game"}<small>{def ? playersLabel(def.players) : "Optional"}</small></button>
      {def && <button type="button" className={styles.remove} aria-label="No game" onClick={() => onPick("")}><X size={16} aria-hidden="true" /></button>}
    </div>
    {open && <GolfTripActionSheet label="Choose a game" onClose={() => setOpen(false)} className={gamesStyles.gameSheet} style={{ top: 24, bottom: 24 }}>
      <div className={gamesStyles.sheetBody}>
        <h3 className={gamesStyles.sheetTitle}>Choose a game</h3>
        {GAME_GROUPS.map((group) => <section key={group.title} className={gamesStyles.sheetGroup} aria-label={group.title}>
          <h4 className={gamesStyles.sheetGroupTitle}>{group.title}</h4>
          {group.ids.map((id) => { const g = gameDef(id); return <button type="button" key={id} className={gamesStyles.sheetGame} aria-pressed={gameId === id} onClick={() => { onPick(id); setOpen(false); }}>
            <strong>{g.name}</strong><span>{g.blurb} · {playersLabel(g.players)}</span>
          </button>; })}
        </section>)}
      </div>
    </GolfTripActionSheet>}
  </>;
}

function HandicapInput({ value, onChange, label }: { value: string; onChange: (text: string) => void; label: string }) {
  return <input className={styles.handicap} inputMode="decimal" placeholder="Hcp" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />;
}

/** Invite a player: search Maroon accounts by name (accounts only, no guests). */
function InvitePlayer({ taken, onInvite }: { taken: string[]; onInvite: (player: RoundPlayer) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; username: string }[]>([]);
  const [searched, setSearched] = useState("");
  const text = query.trim();
  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/account/search?q=${encodeURIComponent(text)}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<{ ok: boolean; accounts?: { id: string; name: string; username: string }[] }>)
        .then((body) => { setFound(body.accounts ?? []); setSearched(text); })
        .catch(() => { /* keep typing */ });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [text]);
  const results = text.length < 2 ? [] : found.filter((account) => !taken.includes(account.id));
  return <div className={styles.addPlayer}>
    <input type="search" placeholder="Invite a player: search by name" aria-label="Invite a player" value={query} onChange={(event) => setQuery(event.target.value)} />
    {results.length > 0 && <ul className={styles.results}>{results.map((account) => <li key={account.id}>
      <button type="button" onClick={() => { onInvite({ name: account.name, profileId: account.id, handicap: null }); setQuery(""); setFound([]); }}><span>{account.name} <small>@{account.username}</small></span><b>Invite</b></button>
    </li>)}</ul>}
    {text.length >= 2 && searched === text && results.length === 0 && <p className={styles.blurb}>No Maroon accounts match &ldquo;{text}&rdquo;. Players need an account to be invited.</p>}
  </div>;
}

/** Add a guest: someone playing without the app. Their score stays on this round only. */
function AddGuest({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const text = name.trim().slice(0, 40);
  const add = () => { if (text) { onAdd(text); setName(""); } };
  return <div className={styles.addGuest}>
    <input placeholder="Add a guest: their name" aria-label="Guest's name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
    <button type="button" className={styles.secondary} disabled={!text} onClick={add}>Add guest</button>
  </div>;
}

/** Tap hole numbers to choose where a side game is played (longest drive, closest to the pin). Shows each hole's par. */
function HolePicker({ label, par, range, selected, onChange }: { label: string; par: number[]; range: [number, number]; selected: number[]; onChange: (holes: number[]) => void }) {
  const holes = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i + 1);
  return <fieldset className={styles.holePicker}><legend>{label}</legend>
    <div>{holes.map((n) => <button key={n} type="button" aria-pressed={selected.includes(n)} aria-label={`Hole ${n}, par ${par[n - 1]}`}
      onClick={() => onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n].sort((a, b) => a - b))}>
      <b>{n}</b><small>Par {par[n - 1]}</small></button>)}</div>
  </fieldset>;
}

/** Everyone's strokes for the game. Holes before `upTo` (and any hole someone has entered) count; untouched = par. */
function gameStrokes(rows: (number | null)[][], par: number[], upTo: number, touched: (h: number) => boolean) {
  return rows.map((row) => row.map((s, h) => h < upTo || touched(h) ? s ?? par[h] : null));
}

/** Untouched holes show (and submit) as par, so only holes that differ from par or have stats need restoring. */
function restore(card: SheetCard | undefined, par: number[]) {
  return {
    initialHoles: card?.strokes.map((s, i) => s === par[i] && card.putts[i] == null ? null : s),
    prefill: card ? { opponentHoles: [], putts: card.putts, fairways: card.fairways, greens: card.greens } : undefined,
  };
}

async function submitCard(setup: PersonalRoundSetup, scored: ScoredCard, startedAt: string): Promise<{ round: PlayerRound; members?: MemberSave[] } | { error: string }> {
  try {
    const response = await fetch("/api/rounds/personal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setup, card: scored, startedAt }) });
    const body = await response.json() as { ok: boolean; round?: PlayerRound; members?: MemberSave[]; code?: string };
    if (body.ok && body.round) return { round: body.round, members: body.members };
    return { error: body.code === "not_installed" ? "Rounds can't be saved yet: the rounds database hasn't been set up. Your scores are kept on this phone." : "Couldn't save the round. Your scores are kept on this phone; try again." };
  } catch {
    return { error: "No connection. Your scores are kept on this phone; try again when you're back online." };
  }
}

function RoundStatus({ save, onRetry, leave }: { save: SaveState; onRetry: () => void; leave: ReactNode }) {
  if (save.status === "saved") return <div className={styles.saved} role="status">
    <p className={styles.savedTotal}>{save.round.total}</p>
    <p>Round saved. {save.round.countsForHandicap ? "It counts toward your handicap." : `Not counted: ${save.round.notCountedReason}.`}</p>
    {save.members?.some((m) => m.saved) && <p>Also saved to {save.members.filter((m) => m.saved).map((m) => firstName(m.name)).join(", ")}&apos;s {save.members.filter((m) => m.saved).length === 1 ? "profile" : "profiles"}.</p>}
    {save.members?.some((m) => !m.saved) && <p className={styles.error}>Not saved for {save.members.filter((m) => !m.saved).map((m) => firstName(m.name)).join(", ")}: not every hole was scored for them.</p>}
    {save.game && <Standings result={save.game} />}
    <Link href="/profile" className={styles.primary}>See my rounds <ArrowRight size={16} aria-hidden="true" /></Link>
    <Link href="/" className={styles.secondary}>Back to Play</Link>
  </div>;
  return <>
    <p className={styles.note}>{save.status === "saving" ? "Saving your round…" : "Pull up Scoring to enter each hole. Submit & Save is on the Card once every hole is in."}</p>
    {save.status === "error" && <p className={styles.error} role="alert">{save.message}</p>}
    {save.status === "error" && <button type="button" className={styles.secondary} onClick={onRetry}>Try again</button>}
    {leave}
  </>;
}

/** A round on my own (kept only on this phone). */
function PlayStep({ saved, onDiscard }: { saved: Saved; onDiscard: () => void }) {
  const [setup, setSetup] = useState(saved.setup);
  const range = holeRange(setup.holes);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  // "Try again" after a failed save reopens the sheet unlocked from the scores kept on this phone.
  const [attempt, setAttempt] = useState(0);
  const [card, setCard] = useState(saved.card);
  const { initialHoles, prefill } = restore(card, setup.course.par);

  async function submit(scored: ScoredCard) {
    setSave({ status: "saving" });
    const result = await submitCard(setup, scored, saved.startedAt);
    if ("error" in result) { setSave({ status: "error", message: result.error }); return { ok: false, message: result.error }; }
    write(null);
    setSave({ status: "saved", round: result.round, game: null });
    return { ok: true };
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="Back to Play (your round is kept)"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Play a round</p></header>
    <section className={styles.panel}>
      <h1 className={styles.title}>{setup.course.name}</h1>
      <p className={styles.place}>{[setup.tee?.name, holesLabel(setup.holes), setup.countForHandicap ? null : "Practice"].filter(Boolean).join(" · ")}</p>
      <RoundStatus save={save} onRetry={() => { setCard(read()?.card); setAttempt((n) => n + 1); setSave({ status: "idle" }); }}
        leave={<button type="button" className={styles.discard} onClick={() => { if (window.confirm("Discard this round? Scores on this phone will be deleted.")) onDiscard(); }}>Discard round</button>} />
    </section>
    {save.status !== "saved" && <GolfTripScoring key={attempt} solo startOpen={!card} stats={setup.stats} holeRange={range} scoringViewOverride="slide" swipeHoles noBottomMenu cardTotals={false}
      par={setup.course.par} courseName={setup.course.name} initialHoles={initialHoles} prefill={prefill} onSubmit={submit}
      onCardChange={(next) => update(saved, { card: next })}
      onParChange={setup.course.custom ? (hole, value) => { const next = withPar(setup, hole, value); setSetup(next); update(saved, { setup: next }); saveBuiltPars(next.course.ref, next.course.par); } : undefined} />}
  </main>;
}

/**
 * A round with friends: the round lives in the database and every phone checks it every few seconds. The host keeps
 * score for everyone (players who joined and guests); joined players watch the live card and standings, and — when the
 * host turned player stats on — enter only their own putts / fairway / green. The host's Submit & Save saves everyone's.
 */
function SharedPlayStep({ saved }: { saved: Saved }) {
  const id = saved.sharedId!;
  const router = useRouter();
  /** The round is gone (deleted): forget it on this phone and go to the Play home screen. */
  const exitToPlay = () => { write(null); router.replace("/"); };
  const [snap, setSnap] = useState<SharedRound | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [card, setCard] = useState(saved.card);
  const [menu, setMenu] = useState<null | "players" | "game">(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Round complete (owner 2026-11-22): after the last hole's Next, a summary with Save & exit round. */
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pickingGame, setPickingGame] = useState(false);
  /** Changes sent but not confirmed yet ("profile:hole" / "guest:id:hole" → strokes; "pick:hole" → pick; "stats:hole" → stats), so a poll never undoes them. */
  const [pending, setPending] = useState<Record<string, unknown>>({});
  /** My strokes as last sent, so only holes I changed are sent. */
  const sentMine = useRef<(number | null)[] | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => fetch(sharedUrl(id), { cache: "no-store" }).then((r) => r.json() as Promise<{ ok: boolean; round?: SharedRound; me?: string; code?: string; inviteCode?: string | null }>).then((body) => {
      if (stop) return;
      if (body.ok && body.round && body.me) { setSnap(body.round); setMe(body.me); setInviteCode(body.inviteCode ?? null); setProblem(null); return; }
      setProblem(body.code === "not_in_round" ? "deleted" : "Can't reach the round right now. Scores already sent are safe.");
    }).catch(() => { if (!stop) setProblem("No connection. Changes send again when you're back."); });
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { stop = true; window.clearInterval(timer); };
  }, [id]);

  const setup = snap?.setup ?? saved.setup;
  const range = holeRange(setup.holes);
  const par = setup.course.par;
  const guests = setup.guests ?? [];
  const strokesOf = (profileId: string) => {
    const row: (number | null)[] = Array.from({ length: 18 }, () => null);
    for (const h of snap?.holes ?? []) if (h.profileId === profileId) row[h.hole - 1] = h.strokes;
    for (const [key, value] of Object.entries(pending)) { const [who, hole] = key.split(":"); if (who === profileId) row[Number(hole)] = value as number | null; }
    return row;
  };
  const guestRow = (guestId: string) => {
    const row = guestStrokes(snap ?? {}, guestId);
    for (const [key, value] of Object.entries(pending)) { const [kind, who, hole] = key.split(":"); if (kind === "guest" && who === guestId) row[Number(hole)] = value as number | null; }
    return row;
  };
  const inputs: HoleInput[] = Array.from({ length: 18 }, (_, h) => (pending[`pick:${h}`] as HoleInput | undefined) ?? snap?.picks.find((k) => k.hole === h + 1)?.pick ?? {});

  async function send(key: string, value: unknown, body: object) {
    setPending((all) => ({ ...all, [key]: value }));
    const result = await post(sharedUrl(id), body);
    // Keep showing the change until the next poll has it (or drop it if the database refused).
    if (!result.ok) { setPending((all) => { const next = { ...all }; delete next[key]; return next; }); setProblem(result.message ?? "A change didn't send. Try again when you're back online."); }
    else window.setTimeout(() => setPending((all) => { if (all[key] !== value) return all; const next = { ...all }; delete next[key]; return next; }), POLL_MS + 1000);
  }
  const sendStrokes = (player: string, hole: number, strokes: number | null) => void send(`${player}:${hole}`, strokes, { action: "strokes", player, hole: hole + 1, strokes });
  const sendGuestStrokes = (guest: string, hole: number, strokes: number | null) => void send(`guest:${guest}:${hole}`, strokes, { action: "guestStrokes", guest, hole: hole + 1, strokes });
  /** Delete round (owner 2026-11-22): the scorekeeper deletes it for every player and from the database. */
  async function deleteRound() {
    if (!window.confirm("Delete this round for everyone? All scores are wiped and nothing is saved. This can't be undone.")) return;
    setDeleting(true);
    const result = await post(sharedUrl(id), { action: "delete" });
    setDeleting(false);
    if (result.ok) { exitToPlay(); return; }
    setProblem(result.message ?? "Couldn't delete the round. Try again.");
  }
  async function hostAction(body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const result = await post(sharedUrl(id), body);
    if (!result.ok) setProblem(result.message ?? "That didn't work. Try again.");
  }

  if (!snap || !me) return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="Back to Play"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Round with friends</p></header>
    <section className={styles.panel}>{problem ? <><p className={styles.error} role="alert">{problem === "deleted" ? "This round was deleted by the scorekeeper, or you're no longer in it." : problem}</p>
      <button type="button" className={styles.primary} onClick={exitToPlay}>Back to Play</button></> : <p className={styles.note}>Loading the round…</p>}</section>
  </main>;

  const active = snap.players.filter((p) => p.status === "invited" || p.status === "joined").sort((a, b) => a.position - b.position);
  const isHost = snap.host === me;
  const ended = snap.status === "ended";
  const others = active.filter((p) => p.profileId !== me);
  const myRemote = strokesOf(me);
  const room = active.length + guests.length < 5;
  // First open on this phone with scores already in the round: start from them.
  const startCard = card ?? (myRemote.some((s) => s != null) ? { strokes: myRemote.map((s, h) => s ?? par[h]), putts: par.map(() => null), fairways: par.map(() => null), greens: par.map(() => null), penalties: [], attestStrokes: [] } : undefined);
  const { initialHoles, prefill } = restore(startCard, par);
  const nameOf = (p: Player) => p.profileId === me ? "You" : firstName(p.name);
  const handicapFor = (p: Player) => p.profileId === snap.host ? setup.myHandicap ?? null : setup.players?.find((x) => x.profileId === p.profileId)?.handicap ?? null;
  // Everyone in the game, in order: players (host first) then guests.
  // Everyone in the game, in the playing order: the host's chosen / shuffled order (Round settings), else players then guests.
  const people = [...active.map((p) => ({ key: p.profileId, name: nameOf(p), handicap: handicapFor(p), strokes: () => strokesOf(p.profileId) })),
    ...guests.map((g) => ({ key: g.id, name: firstName(g.name), handicap: g.handicap, strokes: () => guestRow(g.id) }))];
  const orderOf = (key: string) => { const i = setup.playerOrder?.indexOf(key) ?? -1; return i < 0 ? 100 + people.findIndex((x) => x.key === key) : i; };
  const ordered = [...people].sort((a, b) => orderOf(a.key) - orderOf(b.key));
  const gamePlayers = ordered.map((x) => ({ name: x.name, handicap: x.handicap }));
  const gameCourse = { par, strokeIndex: setup.course.strokeIndex, rating: setup.tee?.rating ?? null, slope: setup.tee?.slope ?? null };
  const def = setup.game ? gameDef(setup.game.id) : null;
  const gameFits = !def || def.players.includes(gamePlayers.length);
  // What's actually been entered (no par for untouched holes): the leaderboard, friends' standings and the P&L use this.
  const enteredRows = () => ordered.map((x) => x.strokes());
  const boardRows = () => ordered.map((x) => ({ name: x.name, strokes: x.strokes() }));
  /** Wolf / Sixes: the order decides who's the Wolf / who partners whom. It can change until the first hole is scored. */
  const orderMatters = setup.game?.id === "wolf" || setup.game?.id === "sixes";
  const orderLocked = enteredRows().some((row) => row.some((v) => v != null)) || inputs.some((i) => Object.keys(i).length > 0);
  const setOrder = (keys: string[]) => { const next = { ...setup, playerOrder: keys }; setSnap({ ...snap, setup: next }); void hostAction({ action: "setup", setup: next }); };
  const shuffle = () => setOrder(shuffled(ordered.map((x) => x.key)));
  const move = (from: number, to: number) => { const keys = ordered.map((x) => x.key); const [k] = keys.splice(from, 1); keys.splice(to, 0, k); setOrder(keys); };
  const liveResult = setup.game && gameFits ? scoreGame(setup.game, gamePlayers, gameCourse, range, enteredRows(), inputs) : null;
  const gameHoleMoney = setup.game && gameFits ? moneyByHole(setup.game, gamePlayers, gameCourse, range, enteredRows(), inputs) : null;
  // Side games (greenies, longest drive, closest to the pin): their $ adds into the leaderboard's $ and the P&L rows.
  const sideMoney = sideGameMoney(setup.sideGames, ordered.length, par, range, inputs);
  const holeMoney = !sideMoney ? gameHoleMoney : ordered.map((_, p) => par.map((__, h) => {
    const a = gameHoleMoney?.[p][h] ?? null, b = sideMoney.byHole[p][h];
    return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
  }));
  const doubledHoles = inputs.map((i) => setup.game?.doubles === true && i.doubled === true);
  /** Next hole: every player's score for the hole goes to the round (and the leaderboard) — what the boxes show, par when untouched. */
  function finishHole(hole: number) {
    const mine = read()?.card?.strokes[hole] ?? par[hole];
    if (strokesOf(me!)[hole] !== mine) { (sentMine.current ??= par.map((p, h) => myRemote[h] ?? p))[hole] = mine; sendStrokes(me!, hole, mine); }
    for (const p of others) if (strokesOf(p.profileId)[hole] == null) sendStrokes(p.profileId, hole, par[hole]);
    for (const g of guests) if (guestRow(g.id)[hole] == null) sendGuestStrokes(g.id, hole, par[hole]);
    if (hole === range[1] - 1) setSummaryOpen(true);
  }
  /** Save & exit round: the scorekeeper's card (as entered, par where untouched) saves everyone's rounds, then Play home. */
  async function saveAndExit() {
    const card = read()?.card;
    const scored: ScoredCard = {
      strokes: par.map((p, h) => card?.strokes[h] ?? myRemote[h] ?? p),
      putts: par.map((_, h) => card?.putts[h] ?? null), fairways: par.map((_, h) => card?.fairways[h] ?? null), greens: par.map((_, h) => card?.greens[h] ?? null),
      ...(card?.penalties?.length ? { penalties: card.penalties } : {}),
    };
    const result = await submit(scored);
    if (result.ok) { setSummaryOpen(false); router.replace("/"); }
  }
  const setGuests = (next: RoundGuest[]) => { setSnap({ ...snap, setup: { ...setup, guests: next } }); void hostAction({ action: "setup", setup: { ...setup, guests: next } }); };

  async function submit(scored: ScoredCard) {
    setSave({ status: "saving" });
    const result = await submitCard(setup, scored, id);
    if ("error" in result) { setSave({ status: "error", message: result.error }); return { ok: false, message: result.error }; }
    const game = setup.game && gameFits ? scoreGame(setup.game, gamePlayers, gameCourse, range, gameStrokes(ordered.map((x) => x.key === me ? scored.strokes : x.strokes()), par, 18, () => true), inputs) : null;
    write(null);
    setSave({ status: "saved", round: result.round, game, members: result.members });
    return { ok: true };
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="Back to Play (your round is kept)"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Round with friends{isHost ? " · you keep score" : ""}</p>
      <button type="button" className={`${styles.back} ${styles.settingsButton}`} aria-label="Round settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><SettingsIcon size={18} aria-hidden="true" /></button></header>
    <section className={styles.panel}>
      <h1 className={styles.title}>{setup.course.name}</h1>
      <p className={styles.place}>{[setup.tee?.name, holesLabel(setup.holes), def?.name, ended ? "Round ended" : null].filter(Boolean).join(" · ")}</p>
      {problem === "deleted" ? <><p className={styles.error} role="alert">This round was deleted by the scorekeeper, or you&apos;re no longer in it.</p>
        <button type="button" className={styles.primary} onClick={exitToPlay}>Back to Play</button></>
        : problem && <p className={styles.error} role="alert">{problem}</p>}
      {save.status !== "saved" && problem !== "deleted" && <Leaderboard range={range} par={par} result={liveResult} rows={boardRows()} holeMoney={holeMoney} doubled={doubledHoles} extraMoney={sideMoney?.total ?? null} />}
      {def && !gameFits && <p className={styles.needs}>{def.name} needs {playersLabel(def.players)}; there are {gamePlayers.length} in the round, so it isn&apos;t scored right now.</p>}
      {/* Saving / saved / a failed save show here; the everyday tip and Leave are in Round settings. */}
      {isHost && save.status !== "idle" && <RoundStatus save={save} onRetry={() => { setCard(read()?.card); setAttempt((n) => n + 1); setSave({ status: "idle" }); }} leave={null} />}
      {!isHost && ended && <><p className={styles.note}>Round finished. When the host scored every hole, it&apos;s saved to your Profile → Rounds.</p>
        <Link href="/profile" className={styles.primary}>See my rounds <ArrowRight size={16} aria-hidden="true" /></Link></>}
    </section>
    {summaryOpen && isHost && <GolfTripActionSheet label="Round complete" slideUp onClose={() => setSummaryOpen(false)}>
      <div className={styles.settingsBody}>
        <h2 className={styles.settingsTitle}>Round complete</h2>
        <p className={styles.settingsLabel}>{[setup.course.name, def?.name].filter(Boolean).join(" · ")}</p>
        <Leaderboard range={range} par={par} result={liveResult} rows={boardRows()} holeMoney={holeMoney} doubled={doubledHoles} extraMoney={sideMoney?.total ?? null} />
        {save.status === "error" && <p className={styles.error} role="alert">{save.message}</p>}
        <button type="button" className={wiz.continue} disabled={save.status === "saving"} onClick={() => void saveAndExit()}>{save.status === "saving" ? "Saving…" : "Save & exit round"}</button>
        <button type="button" className={styles.discard} onClick={() => setSummaryOpen(false)}>Keep editing</button>
      </div>
    </GolfTripActionSheet>}
    {/* Round settings (owner 2026-11-22): the players and Manage, the tip, and Leave round, behind the gear top right. */}
    {settingsOpen && <GolfTripActionSheet label="Round settings" slideUp onClose={() => { setSettingsOpen(false); setMenu(null); }}>
      <div className={styles.settingsBody}>
        <h2 className={styles.settingsTitle}>Round settings</h2>
        <p className={styles.settingsLabel}>{active.length + guests.length} players</p>
        <ul className={styles.roster} aria-label="Players">
          {active.map((p) => <li key={p.profileId}><span>{p.profileId === me ? "You" : p.name}{p.profileId === snap.host && <small>Scorekeeper</small>}</span>
            <b data-status={p.status}>{p.status === "joined" ? "Joined" : "Invited"}</b>
            {isHost && p.profileId !== me && !ended && <button type="button" className={styles.remove} aria-label={p.status === "invited" ? `Cancel ${p.name}'s invite` : `Remove ${p.name}`}
              onClick={() => hostAction({ action: "remove", profileId: p.profileId }, p.status === "invited" ? `Cancel ${p.name}'s invite?` : `Remove ${p.name} from the round?`)}><X size={16} aria-hidden="true" /></button>}
          </li>)}
          {guests.map((g) => <li key={g.id}><span>{g.name}</span><b data-status="guest">Guest</b>
            {isHost && !ended && <button type="button" className={styles.remove} aria-label={`Remove ${g.name}`}
              onClick={() => { if (window.confirm(`Remove ${g.name} from the round?`)) setGuests(guests.filter((x) => x.id !== g.id)); }}><X size={16} aria-hidden="true" /></button>}
          </li>)}
        </ul>
        {isHost && !ended && save.status !== "saved" && <>
          <div className={styles.hostMenu} role="group" aria-label="Host">
            <button type="button" className={styles.secondary} aria-expanded={menu === "players"} onClick={() => setMenu(menu === "players" ? null : "players")}>Add players</button>
            <button type="button" className={styles.secondary} aria-expanded={menu === "game"} onClick={() => setMenu(menu === "game" ? null : "game")}>Change game</button>
          </div>
          {menu === "players" && (room
            ? <div className={styles.form}>
                <InvitePlayer taken={active.map((p) => p.profileId)} onInvite={(player) => { void hostAction({ action: "invite", profileId: player.profileId }); setMenu(null); }} />
                <AddGuest onAdd={(name) => { setGuests([...guests, { id: newGuestId(), name, handicap: null }]); setMenu(null); }} />
              </div>
            : <p className={styles.note}>A round has up to 5 players, guests included.</p>)}
          {menu === "game" && <div className={styles.form}>
            <GamePicker gameId={setup.game?.id ?? ""} open={pickingGame} setOpen={setPickingGame} onPick={(gameId) => {
              const next = gameId ? gameDef(gameId) : null;
              void hostAction({ action: "setup", setup: { ...setup, game: next ? { id: next.id, net: !next.teamFormat && (setup.game?.net ?? false), birdiesDouble: next.points && (setup.game?.birdiesDouble ?? false) } : null } });
              setMenu(null);
            }} />
          </div>}
        </>}
        {orderMatters && gameFits && <section className={styles.orderBox} aria-label="Playing order">
          <div className={styles.orderHead}><p className={styles.settingsLabel}>{setup.game?.id === "wolf" ? "Wolf order" : "Playing order"}</p>
            {isHost && !orderLocked && !ended && <button type="button" className={styles.secondary} onClick={shuffle}>Randomize</button>}</div>
          <ol className={styles.orderList}>{ordered.map((x, i) => <li key={x.key}>
            <span className={styles.orderNum}>{i + 1}</span><span className={styles.orderName}>{x.name}</span>
            {isHost && !orderLocked && !ended && <>
              <button type="button" aria-label={`Move ${x.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
              <button type="button" aria-label={`Move ${x.name} down`} disabled={i === ordered.length - 1} onClick={() => move(i, i + 1)}>↓</button>
            </>}
          </li>)}</ol>
          <p className={styles.blurb}>{orderLocked ? "The order is set once the first hole is scored." : setup.game?.id === "wolf" ? "The Wolf goes in this order, starting on the first hole." : "Partners change every 6 holes in this order."}</p>
        </section>}
        {/* The code to share lives here, not under the leaderboard (owner 2026-11-22). */}
        {inviteCode && !ended && save.status !== "saved" && room && <InviteCodeCard kind="round" id={id} code={inviteCode} name={setup.course.name} canEmail={isHost} />}
        <p className={styles.note}>{isHost ? "Pull up Scoring to enter each hole. Submit & Save is on the Card once every hole is in."
          : `${firstName(active.find((p) => p.profileId === snap.host)?.name ?? "The host")} is keeping score. When they submit, this round is saved to your profile.`}</p>
        {isHost && <button type="button" className={styles.deleteRound} disabled={deleting} onClick={() => void deleteRound()}>{deleting ? "Deleting…" : "Delete round"}</button>}
      </div>
    </GolfTripActionSheet>}
    {isHost && save.status !== "saved" && <GolfTripScoring key={attempt} solo startOpen={!card} stats={setup.stats} holeRange={range} scoringViewOverride="slide" swipeHoles noBottomMenu cardTotals={false}
      onNextHole={finishHole} holeAlert={(h) => setup.game?.id === "wolf" && gameFits && inputs[h]?.wolfPartner === undefined && enteredRows().every((row) => row[h] != null)}
      par={par} courseName={setup.course.name} initialHoles={initialHoles} prefill={prefill} onSubmit={submit} remoteHoles={myRemote}
      onParChange={setup.course.custom && !ended ? (hole, value) => { const next = withPar(setup, hole, value); setSnap({ ...snap, setup: next }); saveBuiltPars(next.course.ref, next.course.par); void hostAction({ action: "setup", setup: next }); } : undefined}
      onCardChange={(next) => {
        update(saved, { card: next });
        // Send only the holes I changed (compared with what the round already has for me, untouched = par).
        const sent = sentMine.current ??= par.map((p, h) => myRemote[h] ?? p);
        next.strokes.forEach((s, h) => { if (h >= range[0] && h < range[1] && s !== sent[h]) { sent[h] = s; sendStrokes(me, h, s); } });
      }}
      group={others.length || guests.length ? {
        names: [...others.map((p) => `${firstName(p.name)}${p.status === "invited" ? " (inv.)" : ""}`), ...guests.map((g) => firstName(g.name))],
        strokes: [...others.map((p) => strokesOf(p.profileId)), ...guests.map((g) => guestRow(g.id))],
        editable: [...others, ...guests].map(() => !ended),
        onChange: (next) => next.forEach((row, g) => {
          const guest = g >= others.length ? guests[g - others.length] : null;
          const before = guest ? guestRow(guest.id) : strokesOf(others[g].profileId);
          row.forEach((s, h) => { if (s !== before[h]) { if (guest) sendGuestStrokes(guest.id, h, s); else sendStrokes(others[g].profileId, h, s); } });
        }),
      } : undefined}
      gameSlot={(setup.game && gameFits) || setup.sideGames ? (hole) => <div className={styles.game}>
        {setup.game && gameFits && <HolePicks game={setup.game} hole={hole} range={range} names={gamePlayers.map((p) => p.name)} input={inputs[hole]} onChange={(part) => {
          const next = { ...inputs[hole], ...part };
          void send(`pick:${hole}`, next, { action: "pick", hole: hole + 1, pick: next });
        }} />}
        {setup.game?.doubles && gameFits && !ended && <button type="button" className={styles.doubleBet} aria-pressed={inputs[hole]?.doubled === true} onClick={() => {
          const next = { ...inputs[hole], doubled: !inputs[hole]?.doubled };
          void send(`pick:${hole}`, next, { action: "pick", hole: hole + 1, pick: next });
        }}>{inputs[hole]?.doubled ? "Doubled ×2 · tap to undo" : "Double bet"}</button>}
        {sideGamesOn(setup.sideGames, hole, par).map((kind) => <SidePick key={kind} kind={kind} names={gamePlayers.map((x) => x.name)}
          value={inputs[hole]?.[kind]} onChange={(winner) => {
            const next = { ...inputs[hole], [kind]: winner };
            if (winner === undefined) delete next[kind];
            void send(`pick:${hole}`, next, { action: "pick", hole: hole + 1, pick: next });
          }} />)}
      </div> : undefined} />}
    {!isHost && <section className={styles.panel}>
      {setup.playerStats && !ended && <MyStats range={range} par={par} holes={snap.holes.filter((h) => h.profileId === me)} pending={pending}
        onChange={(hole, stats) => void send(`stats:${hole}`, stats, { action: "stats", hole: hole + 1, ...stats })} />}
    </section>}
  </main>;
}

type HoleStats = { putts: number | null; fairway: ShotResult | null; green: ShotResult | null };

/** A score's scorecard mark (owner 2026-11-22): circle = birdie, double circle = eagle or better, square = bogey, double
 *  square = double bogey or worse; par has none. */
const scoreMark = (vsPar: number) => vsPar <= -2 ? "eagle" : vsPar === -1 ? "birdie" : vsPar === 0 ? "par" : vsPar === 1 ? "bogey" : "double";

/** One player's scorecard, opened from the leaderboard: front and back nine, each with Par, the score, and — with a game
 *  that has money — what they won or lost on each hole (a P&L row). */
function PlayerCard({ name, strokes, par, range, pnl, doubled }: { name: string; strokes: (number | null)[]; par: number[]; range: [number, number]; pnl: (number | null)[] | null; doubled: boolean[] }) {
  const nines = [[0, 9], [9, 18]].filter(([a, b]) => a < range[1] && b > range[0]).map(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i));
  const sum = (holes: number[], values: (number | null)[]) => holes.some((h) => values[h] != null) ? holes.reduce((t, h) => t + (values[h] ?? 0), 0) : null;
  const cash = (n: number | null) => n == null ? "" : n === 0 ? "–" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
  return <div className={styles.playerCard} role="region" aria-label={`${name}'s scorecard`}>
    {nines.map((holes, i) => <table key={i}>
      <thead><tr><th scope="row">{i === 0 && range[0] === 0 ? "Out" : "In"}</th>{holes.map((h) => <th key={h} scope="col">{h + 1}{doubled[h] && <sup aria-label="doubled">×2</sup>}</th>)}<th scope="col">Tot</th></tr></thead>
      <tbody>
        <tr className={styles.playerCardPar}><th scope="row">Par</th>{holes.map((h) => <td key={h}>{par[h]}</td>)}<td>{holes.reduce((t, h) => t + par[h], 0)}</td></tr>
        <tr><th scope="row">Score</th>{holes.map((h) => <td key={h}>{strokes[h] != null && <span className={styles.scoreMark} data-mark={scoreMark(strokes[h]! - par[h])}>{strokes[h]}</span>}</td>)}<td>{sum(holes, strokes) ?? ""}</td></tr>
        {pnl && <tr className={styles.playerCardPnl}><th scope="row">$</th>{holes.map((h) => <td key={h} data-sign={pnl[h] == null ? undefined : Math.sign(pnl[h]!)}>{cash(pnl[h])}</td>)}<td data-sign={Math.sign(sum(holes, pnl) ?? 0)}>{cash(sum(holes, pnl))}</td></tr>}
      </tbody>
    </table>)}
  </div>;
}

/** My own putts / fairway / green, hole by hole: the only thing a joined player can enter (when the host allows it). */
function MyStats({ range, par, holes, pending, onChange }: { range: [number, number]; par: number[]; holes: SharedRound["holes"]; pending: Record<string, unknown>; onChange: (hole: number, stats: HoleStats) => void }) {
  const [hole, setHole] = useState(range[0]);
  const saved = holes.find((h) => h.hole === hole + 1);
  const stats = (pending[`stats:${hole}`] as HoleStats | undefined) ?? { putts: saved?.putts ?? null, fairway: saved?.fairway ?? null, green: saved?.green ?? null };
  const set = (part: Partial<HoleStats>) => onChange(hole, { ...stats, ...part });
  const choose = (label: string, value: ShotResult | null, choices: [ShotResult, string][], key: "fairway" | "green") =>
    <div className={styles.pickRow} role="group" aria-label={label}><span>{label}</span>
      {choices.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => set({ [key]: value === v ? null : v })}>{text}</button>)}
    </div>;
  return <div className={styles.myStats} role="group" aria-label="My stats">
    <p className={styles.standingsTitle}>My stats</p>
    <div className={styles.myStatsHole}>
      <button type="button" aria-label="Previous hole" disabled={hole <= range[0]} onClick={() => setHole(hole - 1)}><ArrowLeft size={16} aria-hidden="true" /></button>
      <b>Hole {hole + 1} · Par {par[hole]}</b>
      <button type="button" aria-label="Next hole" disabled={hole >= range[1] - 1} onClick={() => setHole(hole + 1)}><ArrowRight size={16} aria-hidden="true" /></button>
    </div>
    <div className={styles.pickRow} role="group" aria-label="Putts"><span>Putts</span>
      <button type="button" aria-label="Fewer putts" disabled={(stats.putts ?? 0) <= 0} onClick={() => set({ putts: Math.max(0, (stats.putts ?? 0) - 1) })}>−</button>
      <b className={styles.myStatsPutts}>{stats.putts ?? "–"}</b>
      <button type="button" aria-label="More putts" disabled={(stats.putts ?? 0) >= 10} onClick={() => set({ putts: Math.min(10, (stats.putts ?? 0) + 1) })}>+</button>
    </div>
    {par[hole] > 3 && choose("Fairway", stats.fairway, [["left", "Left"], ["center", "Hit"], ["right", "Right"]], "fairway")}
    {choose("Green", stats.green, [["center", "Hit"], ["up", "Long"], ["down", "Short"], ["left", "Left"], ["right", "Right"]], "green")}
  </div>;
}

/** A side game's winner on this hole (owner 2026-11-22): the group's names in a row, like the Wolf pick; Greenies add
 *  Carry over (nobody got it). Tap the chosen one again to clear it. */
function SidePick({ kind, names, value, onChange }: { kind: "greenie" | "longestDrive" | "closestPin"; names: string[]; value: number | null | undefined; onChange: (winner: number | null | undefined) => void }) {
  const title = kind === "greenie" ? "Greenie" : kind === "longestDrive" ? "Longest drive" : "Closest to the pin";
  const set = (winner: number | null) => onChange(value === winner ? undefined : winner);
  return <div className={styles.wolfCard} role="group" aria-label={title}>
    <p className={styles.wolfTitle}>{title}</p>
    <div className={styles.wolfRow}>
      {names.map((name, i) => <button key={i} type="button" aria-pressed={value === i} onClick={() => set(i)}>
        <span className={styles.wolfInitial} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span><span className={styles.wolfName}>{name}</span>
      </button>)}
      {kind === "greenie" && <button type="button" aria-pressed={value === null} onClick={() => set(null)}>
        <span className={styles.wolfInitial} aria-hidden="true">→</span><span className={`${styles.wolfName} ${styles.wolfNameWrap}`}>Carry over</span>
      </button>}
    </div>
  </div>;
}

/** The game's extra tap for this hole (Wolf partner, Daytona spots, Bingo Bango Bongo, Snake). */
export function HolePicks({ game, hole, range, names, input, onChange }: { game: GameConfig; hole: number; range: [number, number]; names: string[]; input: HoleInput; onChange: (part: HoleInput) => void }) {
  const kind = gameDef(game.id).holeInput;
  const everyone = names.map((_, i) => i);
  // Tapping the chosen button again clears it (undefined = nothing picked).
  const pick = (label: string, chosen: number | null | undefined, choices: { value: number | null; label: string }[], set: (value: number | null | undefined) => void) =>
    <div className={styles.pickRow} role="group" aria-label={label}><span>{label}</span>
      {choices.map((choice) => <button key={String(choice.value)} type="button" aria-pressed={chosen === choice.value} onClick={() => set(chosen === choice.value ? undefined : choice.value)}>{choice.label}</button>)}
    </div>;
  if (kind === "wolf") {
    const wolf = wolfFor(hole, range, names.length);
    const chosen = input.wolfPartner;
    // Tap a partner (or Lone Wolf); tap it again to clear it.
    const set = (value: number | null) => onChange({ wolfPartner: chosen === value ? undefined : value });
    return <div className={styles.wolfCard} role="group" aria-label="Wolf partner">
      <p className={styles.wolfTitle}><b>{names[wolf]}</b> {names[wolf] === "You" ? "are" : "is"} the Wolf</p>
      <p className={styles.wolfHint}>{chosen === undefined ? "Pick a partner, or go it alone" : chosen === null ? `${names[wolf]} ${names[wolf] === "You" ? "go" : "goes"} Lone Wolf · points ×2` : `${names[wolf]} + ${names[chosen]} vs the rest`}</p>
      <div className={styles.wolfRow}>
        {everyone.filter((i) => i !== wolf).map((i) => <button key={i} type="button" aria-pressed={chosen === i} onClick={() => set(i)}>
          <span className={styles.wolfInitial} aria-hidden="true">{names[i].slice(0, 1).toUpperCase()}</span>
          <span className={styles.wolfName}>{names[i]}</span>
        </button>)}
        <button type="button" aria-pressed={chosen === null} onClick={() => set(null)}>
          <span className={styles.wolfInitial} aria-hidden="true">×2</span>
          <span className={styles.wolfName}>Lone Wolf</span>
        </button>
      </div>
    </div>;
  }
  if (kind === "daytona") {
    const spot = input.daytona;
    const middle = spot?.middle;
    const sides = everyone.filter((i) => i !== middle);
    const left: number[] = spot ? [...spot.left] : [];
    return <>
      {pick("Middle", middle ?? undefined, everyone.map((i) => ({ value: i, label: names[i] })), (value) => {
        if (value == null) { onChange({ daytona: undefined }); return; }
        const rest = everyone.filter((i) => i !== value);
        onChange({ daytona: { middle: value, left: [rest[0], rest[1]], right: [rest[2], rest[3]] } });
      })}
      {spot && <div className={styles.pickRow} role="group" aria-label="Left pair"><span>Left pair</span>
        {sides.map((i) => <button key={i} type="button" aria-pressed={left.includes(i)} onClick={() => {
          const nextLeft: number[] = left.includes(i) ? left : [left[1], i];
          const right = sides.filter((j) => !nextLeft.includes(j));
          onChange({ daytona: { middle: spot.middle, left: [nextLeft[0], nextLeft[1]], right: [right[0], right[1]] } });
        }}>{names[i]}</button>)}
      </div>}
    </>;
  }
  if (kind === "bbb") {
    const got = input.bbb ?? {};
    return <>{(["bingo", "bango", "bongo"] as const).map((key) => <div key={key}>{pick(key === "bingo" ? "Bingo (first on)" : key === "bango" ? "Bango (closest)" : "Bongo (first in)", got[key],
      everyone.map((i) => ({ value: i, label: names[i] })), (value) => onChange({ bbb: { ...got, [key]: value ?? undefined } }))}</div>)}</>;
  }
  if (kind === "snake") return pick("Last 3-putt", input.snake, everyone.map((i) => ({ value: i, label: names[i] })), (value) => onChange({ snake: value ?? undefined }));
  return null;
}

/**
 * The leaderboard (owner request 2026-11-21): the trip's individual leaderboard (GolfTripLeaderboard's look — POS ·
 * PLAYER · TOT · THRU, avatars, red under par / gold E), plus the game's count and a $ column. Tapping a name opens that
 * player's scorecard under the row (two 9-hole rows, with a $ row per hole). Team games / Nassau add their lines below.
 */
export function Leaderboard({ rows, par, range, hole, result, compact = false, holeMoney = null, doubled = [], extraMoney = null }: { rows: { name: string; strokes: (number | null)[] }[]; par: number[]; range: [number, number];
  /** The hole on screen (scorekeeper); otherwise the first hole not everyone has finished. */ hole?: number; result: GameResult | null; compact?: boolean;
  /** Each player's $ per hole, in `rows` order (moneyByHole), for their scorecard's P&L row. */ holeMoney?: (number | null)[][] | null; doubled?: boolean[];
  /** Side-game $ per player, in `rows` order, added to the game's money. */ extraMoney?: number[] | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const holes = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i);
  const done = holes.filter((h) => rows.every((row) => row.strokes[h] != null));
  const now = hole ?? holes.find((h) => !done.includes(h)) ?? range[1] - 1;
  const game = new Map((result?.standings ?? []).map((s) => [s.label, s]));
  const perPlayer = rows.every((row) => game.has(row.name));
  const hasMoney = (perPlayer && rows.some((row) => game.get(row.name)?.money !== undefined)) || Boolean(extraMoney);
  // A SKINS column for Skins only (owner 2026-11-22: no PTS column); money shows in $.
  const gameLabel = result && perPlayer && /skins?$/.test(game.get(rows[0].name)?.value ?? "") ? "SKINS" : null;
  const lines = rows.map((row, index) => {
    const played = holes.filter((h) => row.strokes[h] != null);
    const toPar = played.reduce((sum, h) => sum + (row.strokes[h]! - par[h]), 0);
    const standing = perPlayer ? game.get(row.name) : undefined;
    return { ...row, played: played.length, toPar, standing, pnl: holeMoney?.[index] ?? null, cash: (standing?.money ?? 0) + (extraMoney?.[index] ?? 0) };
  }).sort((a, b) => (b.standing?.rank ?? 0) - (a.standing?.rank ?? 0) || (a.played && b.played ? a.toPar - b.toPar : b.played - a.played));
  type Line = typeof lines[number];
  // Ties share a place (T2), like the trip's board.
  const key = (line: Line) => `${line.standing?.rank ?? 0}|${line.played ? line.toPar : "x"}`;
  const position = (i: number) => { const first = lines.findIndex((l) => key(l) === key(lines[i])); const tied = lines.filter((l) => key(l) === key(lines[i])).length > 1; return `${tied ? "T" : ""}${first + 1}`; };
  const totText = (line: Line) => !line.played ? "–" : line.toPar === 0 ? "E" : line.toPar > 0 ? `+${line.toPar}` : String(line.toPar);
  const parTone = (line: Line) => !line.played ? undefined : line.toPar < 0 ? "under" : line.toPar === 0 ? "even" : "over";
  const gameValue = (value: string) => value.replace(/\s*(skins?|pts)$/, "");
  // No THRU column: everyone in a round plays the same hole (owner 2026-11-22).
  const columns = `30px minmax(0,1fr) 34px${gameLabel ? " 42px" : ""}${hasMoney ? " 52px" : ""}`;
  const initialsOf = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className={`${trip.match} ${trip.leaderboard} ${styles.board} ${compact ? styles.boardCompact : ""}`} role="region" aria-label="Leaderboard">
    <p className={styles.boardHead}>{done.length === holes.length ? <b>Final</b> : <><b>Hole {now + 1}</b>{done.length ? ` · thru ${done.at(-1)! + 1}` : ""}</>}{result ? ` · ${result.title.split(" · ")[0]}` : ""}</p>
    <div>
      <div className={trip.leaderboardListHeading}>
        <div className={`${trip.single} ${trip.columns}`} style={{ gridTemplateColumns: columns }} aria-hidden>
          <span className={trip.columnPosition}>POS</span>
          <span className={trip.columnPlayer}>Player</span>
          <span className={trip.columnLabel}>TOT</span>
          {gameLabel && <span className={trip.columnLabel}>{gameLabel}</span>}
          {hasMoney && <span className={trip.columnLabel}>$</span>}
        </div>
      </div>
      <ul className={trip.lineup}>{lines.map((line, i) => <Fragment key={line.name}>
        <li className={trip.single} style={{ gridTemplateColumns: columns }}>
          <span className={trip.rank}>{position(i)}</span>
          <button type="button" className={trip.playerCardTrigger} aria-expanded={open === line.name} aria-label={`${line.name} scorecard`} onClick={() => setOpen(open === line.name ? null : line.name)}>
            <span className={trip.leaderboardAvatar} aria-hidden="true">{initialsOf(line.name)}</span>
            <span className={styles.boardName}>{line.name}</span>
          </button>
          <span className={trip.number} data-par={parTone(line)}>{totText(line)}</span>
          {gameLabel && <span className={trip.number}>{line.standing ? gameValue(line.standing.value) : "—"}</span>}
          {hasMoney && <span className={`${trip.number} ${styles.money}`} data-sign={Math.sign(line.cash)}>{line.cash ? money(line.cash) : "$0"}</span>}
        </li>
        {open === line.name && <li className={styles.boardCard}><PlayerCard name={line.name} strokes={line.strokes} par={par} range={range} pnl={line.pnl} doubled={doubled} /></li>}
      </Fragment>)}</ul>
    </div>
    {result && !perPlayer && <Standings result={result} compact />}
    {result?.note && perPlayer && <p className={styles.standingsNote}>{result.note}</p>}
  </div>;
}

export function Standings({ result, compact = false }: { result: GameResult; compact?: boolean }) {
  return <div className={`${styles.standings} ${compact ? styles.standingsCompact : ""}`} aria-label={result.title}>
    <p className={styles.standingsTitle}>{result.title}</p>
    <ol>{result.standings.map((s, i) => <li key={i}><span>{s.label}</span><b>{s.value}{s.money !== undefined && <em className={styles.money} data-sign={Math.sign(s.money)}>{s.value ? " · " : ""}{s.money === 0 ? "$0" : money(s.money)}</em>}</b></li>)}</ol>
    {result.note && <p className={styles.standingsNote}>{result.note}</p>}
  </div>;
}
