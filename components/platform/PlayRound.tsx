"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { ExploreCourseSearch, place, type CourseResult } from "./ExploreCourseSearch";
import { GolfTripScoring } from "./GolfTripScoring";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import gamesStyles from "./GolfTripGames.module.css";
import { customCourse, holeRange, type HolesChoice, type PersonalRoundSetup, type RoundPlayer, type ScoringCourse } from "@/lib/platform/personalRound";
import { gameDef, scoreGame, wolfFor, type GameConfig, type GameId, type GameResult, type HoleInput } from "@/lib/platform/roundGames";
import type { PlayerRound, ScoredCard } from "@/lib/platform/playerRounds";
import type { SheetCard } from "@/lib/platform/liveCards";
import type { SharedRound } from "@/lib/platform/sharedRoundsServer";
import styles from "./PlayRound.module.css";

/** The round in progress, kept on this phone so a refresh or closed app doesn't lose it. `sharedId` = an invite round in the database. */
const STORAGE_KEY = "maroonPersonalRound";
type Saved = { setup: PersonalRoundSetup; startedAt: string; card?: SheetCard; inputs?: HoleInput[]; sharedId?: string; openedAt?: string };
type SaveState = { status: "idle" | "saving" } | { status: "saved"; round: PlayerRound; game: GameResult | null } | { status: "error"; message: string };
type Player = SharedRound["players"][number];
const MAX_INVITES = 4;
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
const playersLabel = (sizes: number[]) => sizes.length === 1 ? `${sizes[0]} players` : sizes.every((n, i) => i === 0 || n === sizes[i - 1] + 1) ? `${sizes[0]}–${sizes.at(-1)} players` : `${sizes.slice(0, -1).join(", ")} or ${sizes.at(-1)} players`;
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
 * Play a round (/rounds/new): What course? → round setup (invites, game) → the trip's scoring screen → Submit & Save
 * to Profile → Rounds. With invites, the round lives in the database and every joined player scores on their own phone.
 * `openRound` (?round=<id>) opens a shared round, e.g. after Join on the Play page.
 */
export function PlayRound({ openRound }: { openRound?: string }) {
  // A round in progress on this phone (undefined while rendering on the server); starting / discarding overrides it.
  const stored = useSyncExternalStore(subscribeNever, storedText, () => undefined);
  const [override, setRound] = useState<Saved | null | undefined>(undefined);
  const [picked, setPicked] = useState<CourseResult | null>(null);
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
  const leave = () => { write(null); setRound(null); setPicked(null); };
  if (round?.sharedId) return <SharedPlayStep saved={round} onLeave={leave} />;
  if (round) return <PlayStep saved={round} onDiscard={leave} />;
  if (picked) return <SetupStep picked={picked} onBack={() => setPicked(null)} onStart={open} />;
  return <main className={styles.page}>
    {header}
    <LiveRoundBanner />
    <div className={styles.search}><ExploreCourseSearch onPick={setPicked} kicker="Step 1 · Course" title="Where are you playing?" /></div>
  </main>;
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

function SetupStep({ picked, onBack, onStart }: { picked: CourseResult; onBack: () => void; onStart: (saved: Saved) => void }) {
  const [course, setCourse] = useState<ScoringCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tee, setTee] = useState(0);
  const [holes, setHoles] = useState<HolesChoice>("18");
  const [stats, setStats] = useState(true);
  const [countForHandicap, setCount] = useState(true);
  const [datePlayed, setDate] = useState(today);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [myHandicap, setMyHandicap] = useState("");
  const [gameId, setGameId] = useState<GameId | "">("");
  const [net, setNet] = useState(false);
  const [birdiesDouble, setBirdiesDouble] = useState(false);
  const [teams, setTeams] = useState<number[]>([]);
  const [pickingGame, setPickingGame] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [rating, setRating] = useState("");
  const [slope, setSlope] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/rounds/course/${encodeURIComponent(picked.ref)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ ok: boolean; course?: ScoringCourse; code?: string }>)
      .then((body) => body.ok && body.course ? setCourse(body.course)
        : setError(body.code === "no_scorecard" ? "This course doesn't have a scorecard on file yet." : "Couldn't load this course's scorecard right now."))
      .catch((e: Error) => { if (e.name !== "AbortError") setError("Couldn't reach the course. Check your connection."); });
    return () => controller.abort();
  }, [picked.ref]);
  // A built scorecard has no tees on file: an optional rating / slope from the course's own card lets the round count.
  const ratingValue = Number.parseFloat(rating), slopeValue = Number.parseInt(slope, 10);
  const customTee = ratingValue >= 20 && ratingValue <= 90 && slopeValue >= 55 && slopeValue <= 155 ? { name: "From the scorecard", rating: ratingValue, slope: slopeValue } : null;
  const chosenTee = course?.custom ? customTee : course?.tees[tee] ?? null;
  const rated = chosenTee?.rating != null && chosenTee.slope != null;
  const size = players.length + 1;
  const def = gameId ? gameDef(gameId) : null;
  // A game can be picked first; Start waits until the group is the right size for it.
  const fits = !def || def.players.includes(size);
  const needed = def && !fits ? def.players.find((n) => n > size) ?? null : null;
  const teamOf = (i: number) => teams[i] ?? (i < size / 2 ? 0 : 1);
  const teamFormat = def?.teamFormat ?? false;
  const names = ["You", ...players.map((p) => p.name)];
  const handicapNote = !countForHandicap ? "Practice round: saved, not counted" : teamFormat ? "Team formats can't count toward a handicap"
    : !rated ? course?.custom ? "Add the course rating and slope above for it to count" : "This tee has no rating, so it won't count" : holes !== "18" ? "9-hole rounds are saved but don't count yet" : "Counts once you submit";

  async function start() {
    if (!course || !fits) return;
    const game: GameConfig | null = def ? { id: def.id, net: net && !def.teamFormat, birdiesDouble: def.points && birdiesDouble, ...(def.teams ? { teams: names.map((_, i) => teamOf(i)) } : {}) } : null;
    const setup: PersonalRoundSetup = { course, tee: chosenTee, holes, stats, countForHandicap: countForHandicap && !teamFormat, datePlayed, players, myHandicap: handicapValue(myHandicap), game };
    if (!players.length) { onStart({ setup, startedAt: new Date().toISOString() }); return; }
    // With invites, the round is created in the database so everyone can join it.
    setStarting(true); setStartError(null);
    const result = await post("/api/rounds/shared", { setup, invites: players.map((p) => p.profileId) });
    setStarting(false);
    if (result.ok && result.id) { onStart({ setup, startedAt: result.id, sharedId: result.id, openedAt: new Date().toISOString() }); return; }
    setStartError(result.code === "not_installed" ? "Inviting players needs the shared rounds database set up first (supabase/shared_rounds.sql). Remove the invites to play on your own."
      : result.message ?? "Couldn't start the round. Try again.");
  }

  return <main className={styles.page}>
    <header className={styles.header}><button type="button" className={styles.back} onClick={onBack} aria-label="Pick a different course"><ArrowLeft size={18} aria-hidden="true" /></button><p className={styles.kicker}>Round setup</p></header>
    <section className={styles.panel}>
      <h1 className={styles.title}>{picked.name}</h1>
      <p className={styles.place}>{place(picked)}</p>
      {error ? <div className={styles.saved}>
        <p className={styles.note}>{error}</p>
        <button type="button" className={styles.primary} onClick={() => { setCourse(customCourse(picked.ref, picked.name, place(picked), builtPars(picked.ref))); setError(null); }}>Build the scorecard as I play <ArrowRight size={16} aria-hidden="true" /></button>
        <p className={styles.blurb}>Every hole starts at par 4. Tap Par on the scoring screen to change it as you go.</p>
      </div> : !course ? <p className={styles.note}>Loading the scorecard…</p> : <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void start(); }}>
        {course.custom ? <div className={styles.field}><span>Building this scorecard</span>
          <p className={styles.blurb}>{course.par.some((p) => p !== 4) ? "Pars from your last round here. " : "Every hole starts at par 4. "}Tap Par on the scoring screen to change a hole.</p>
          <div className={styles.ratingRow}>
            <label><span>Course rating</span><input inputMode="decimal" placeholder="e.g. 71.2" value={rating} onChange={(event) => setRating(event.target.value)} /></label>
            <label><span>Slope</span><input inputMode="numeric" placeholder="e.g. 125" value={slope} onChange={(event) => setSlope(event.target.value)} /></label>
          </div>
          <p className={styles.blurb}>Optional, from the tee box on the course&apos;s scorecard. Without them the round is saved but doesn&apos;t count toward your handicap.</p>
        </div> : <label className={styles.field}><span>Tee box</span>
          {course.tees.length ? <select value={tee} onChange={(event) => setTee(Number(event.target.value))}>
            {course.tees.map((t, i) => <option key={i} value={i}>{t.name}{t.rating != null && t.slope != null ? ` · ${t.rating} / ${t.slope}` : " · no rating"}</option>)}
          </select> : <p className={styles.note}>No tee boxes listed for this course.</p>}
        </label>}
        <fieldset className={styles.field}><legend>Holes</legend>
          <div className={styles.choices}>{([["18", "18 holes"], ["front", "Front 9"], ["back", "Back 9"]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={holes === value} onClick={() => setHoles(value)}>{label}</button>)}</div>
        </fieldset>

        <fieldset className={styles.field}><legend>Who&apos;s playing?</legend>
          <ul className={styles.players}>
            <li><span>You<small>Host</small></span>{def && net && !teamFormat && <HandicapInput value={myHandicap} onChange={setMyHandicap} label="Your handicap" />}</li>
            {players.map((player, i) => <li key={player.profileId ?? i}>
              <span>{player.name}<small>Will be invited</small></span>
              {def && net && !teamFormat && <HandicapInput value={player.handicap?.toString() ?? ""} onChange={(text) => setPlayers((all) => all.map((p, j) => j === i ? { ...p, handicap: handicapValue(text) } : p))} label={`${player.name}'s handicap`} />}
              <button type="button" className={styles.remove} aria-label={`Don't invite ${player.name}`} onClick={() => { setPlayers((all) => all.filter((_, j) => j !== i)); setTeams([]); }}><X size={16} aria-hidden="true" /></button>
            </li>)}
          </ul>
          {players.length < MAX_INVITES && <InvitePlayer taken={players.flatMap((p) => p.profileId ? [p.profileId] : [])} onInvite={(player) => { setPlayers((all) => [...all, player]); setTeams([]); }} />}
          {players.length > 0 && <p className={styles.blurb}>Invites go out when you start. Players can join any time during the round.</p>}
        </fieldset>

        <fieldset className={styles.field}><legend>Game</legend>
          <GamePicker gameId={def?.id ?? ""} onPick={setGameId} open={pickingGame} setOpen={setPickingGame} />
          {def && <p className={styles.blurb}>{def.blurb}</p>}
          {def && !fits && <p className={styles.needs} role="status">{needed ? `${def.name} needs ${playersLabel(def.players)}: invite ${needed - size} more.` : `${def.name} needs ${playersLabel(def.players)}: remove ${size - Math.max(...def.players)}.`}</p>}
          {fits && def?.teams && size > 2 && <div className={styles.teams} role="group" aria-label="Teams">
            {names.map((name, i) => <button key={i} type="button" aria-pressed={teamOf(i) === 1} onClick={() => setTeams(names.map((_, j) => j === i ? 1 - teamOf(j) : teamOf(j)))}>
              {firstName(name)} <b>{teamOf(i) === 0 ? "Team 1" : "Team 2"}</b></button>)}
          </div>}
          {def && !def.teamFormat && <label className={styles.toggle}><span>Net (use handicaps)<small>Each player gets strokes from their handicap</small></span><input type="checkbox" role="switch" checked={net} onChange={(event) => setNet(event.target.checked)} /></label>}
          {def?.points && <label className={styles.toggle}><span>Birdies double points<small>A hole won with a birdie or better is worth double</small></span><input type="checkbox" role="switch" checked={birdiesDouble} onChange={(event) => setBirdiesDouble(event.target.checked)} /></label>}
        </fieldset>

        <label className={styles.toggle}><span>Keep stats<small>Your putts, fairways and greens</small></span><input type="checkbox" role="switch" checked={stats} onChange={(event) => setStats(event.target.checked)} /></label>
        <label className={`${styles.toggle} ${teamFormat ? styles.toggleOff : ""}`}><span>Count toward my handicap<small>{handicapNote}</small></span>
          <input type="checkbox" role="switch" checked={countForHandicap && !teamFormat} disabled={teamFormat} onChange={(event) => setCount(event.target.checked)} /></label>
        <label className={styles.field}><span>Date played</span><input type="date" value={datePlayed} max={today()} onChange={(event) => setDate(event.target.value || today())} /></label>
        {startError && <p className={styles.error} role="alert">{startError}</p>}
        <button type="submit" className={styles.primary} disabled={!fits || starting}>{starting ? "Starting…" : players.length ? "Start & send invites" : "Start round"} <ArrowRight size={16} aria-hidden="true" /></button>
      </form>}
    </section>
  </main>;
}

/** "Choose a game" button + the trip-style game sheet. */
function GamePicker({ gameId, onPick, open, setOpen }: { gameId: GameId | ""; onPick: (id: GameId | "") => void; open: boolean; setOpen: (open: boolean) => void }) {
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

async function submitCard(setup: PersonalRoundSetup, scored: ScoredCard, startedAt: string): Promise<{ round: PlayerRound } | { error: string }> {
  try {
    const response = await fetch("/api/rounds/personal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setup, card: scored, startedAt }) });
    const body = await response.json() as { ok: boolean; round?: PlayerRound; code?: string };
    if (body.ok && body.round) return { round: body.round };
    return { error: body.code === "not_installed" ? "Rounds can't be saved yet: the rounds database hasn't been set up. Your scores are kept on this phone." : "Couldn't save the round. Your scores are kept on this phone; try again." };
  } catch {
    return { error: "No connection. Your scores are kept on this phone; try again when you're back online." };
  }
}

function RoundStatus({ save, onRetry, leave }: { save: SaveState; onRetry: () => void; leave: ReactNode }) {
  if (save.status === "saved") return <div className={styles.saved} role="status">
    <p className={styles.savedTotal}>{save.round.total}</p>
    <p>Round saved. {save.round.countsForHandicap ? "It counts toward your handicap." : `Not counted: ${save.round.notCountedReason}.`}</p>
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
    {save.status !== "saved" && <GolfTripScoring key={attempt} solo startOpen={!card} stats={setup.stats} holeRange={range}
      par={setup.course.par} courseName={setup.course.name} initialHoles={initialHoles} prefill={prefill} onSubmit={submit}
      onCardChange={(next) => update(saved, { card: next })}
      onParChange={setup.course.custom ? (hole, value) => { const next = withPar(setup, hole, value); setSetup(next); update(saved, { setup: next }); saveBuiltPars(next.course.ref, next.course.par); } : undefined} />}
  </main>;
}

/**
 * A round with friends: the round lives in the database and every phone checks it every few seconds. I enter my own
 * strokes; the host can also enter anyone's (others' boxes are view only for everyone else). My stats stay on my phone.
 */
function SharedPlayStep({ saved, onLeave }: { saved: Saved; onLeave: () => void }) {
  const id = saved.sharedId!;
  const [snap, setSnap] = useState<SharedRound | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [card, setCard] = useState(saved.card);
  const [liveCard, setLiveCard] = useState(saved.card);
  const [menu, setMenu] = useState<null | "players" | "game">(null);
  const [pickingGame, setPickingGame] = useState(false);
  /** Changes sent but not confirmed yet ("profile:hole" → strokes; "pick:hole" → pick), so a poll never undoes them. */
  const [pending, setPending] = useState<Record<string, unknown>>({});
  /** My strokes as last sent, so only holes I changed are sent. */
  const sentMine = useRef<(number | null)[] | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => fetch(sharedUrl(id), { cache: "no-store" }).then((r) => r.json() as Promise<{ ok: boolean; round?: SharedRound; me?: string; code?: string }>).then((body) => {
      if (stop) return;
      if (body.ok && body.round && body.me) { setSnap(body.round); setMe(body.me); setProblem(null); return; }
      setProblem(body.code === "not_in_round" ? "You're no longer in this round. Your own card is still on this phone." : "Can't reach the round right now. Your scores are kept on this phone.");
    }).catch(() => { if (!stop) setProblem("No connection. Your scores are kept on this phone; changes send again when you're back."); });
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { stop = true; window.clearInterval(timer); };
  }, [id]);

  const setup = snap?.setup ?? saved.setup;
  const range = holeRange(setup.holes);
  const par = setup.course.par;
  const strokesOf = (profileId: string) => {
    const row: (number | null)[] = Array.from({ length: 18 }, () => null);
    for (const h of snap?.holes ?? []) if (h.profileId === profileId) row[h.hole - 1] = h.strokes;
    for (const [key, value] of Object.entries(pending)) { const [who, hole] = key.split(":"); if (who === profileId) row[Number(hole)] = value as number | null; }
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
  async function hostAction(body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const result = await post(sharedUrl(id), body);
    if (!result.ok) setProblem(result.message ?? "That didn't work. Try again.");
  }

  if (!snap || !me) return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="Back to Play"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Round with friends</p></header>
    <section className={styles.panel}>{problem ? <><p className={styles.error} role="alert">{problem}</p><button type="button" className={styles.discard} onClick={onLeave}>Leave this round on this phone</button></> : <p className={styles.note}>Loading the round…</p>}</section>
  </main>;

  const active = snap.players.filter((p) => p.status === "invited" || p.status === "joined").sort((a, b) => a.position - b.position);
  const isHost = snap.host === me;
  const ended = snap.status === "ended";
  const others = active.filter((p) => p.profileId !== me);
  const myRemote = strokesOf(me);
  // First open on this phone with scores already in the round: start from them.
  const startCard = card ?? (myRemote.some((s) => s != null) ? { strokes: myRemote.map((s, h) => s ?? par[h]), putts: par.map(() => null), fairways: par.map(() => null), greens: par.map(() => null), penalties: [], attestStrokes: [] } : undefined);
  const { initialHoles, prefill } = restore(startCard, par);
  const nameOf = (p: Player) => p.profileId === me ? "You" : firstName(p.name);
  const handicapFor = (p: Player) => p.profileId === snap.host ? setup.myHandicap ?? null : setup.players?.find((x) => x.profileId === p.profileId)?.handicap ?? null;
  const gamePlayers = active.map((p) => ({ name: nameOf(p), handicap: handicapFor(p) }));
  const rowFor = (p: Player) => p.profileId === me ? liveCard?.strokes.map((s, h) => s ?? myRemote[h]) ?? myRemote : strokesOf(p.profileId);
  const touched = (h: number) => active.some((p) => strokesOf(p.profileId)[h] != null) || (liveCard ? liveCard.strokes[h] !== par[h] || liveCard.putts[h] != null : false);
  const gameCourse = { par, strokeIndex: setup.course.strokeIndex, rating: setup.tee?.rating ?? null, slope: setup.tee?.slope ?? null };
  const def = setup.game ? gameDef(setup.game.id) : null;
  const gameFits = !def || def.players.includes(active.length);

  async function submit(scored: ScoredCard) {
    setSave({ status: "saving" });
    const result = await submitCard(setup, scored, id);
    if ("error" in result) { setSave({ status: "error", message: result.error }); return { ok: false, message: result.error }; }
    const game = setup.game && gameFits ? scoreGame(setup.game, gamePlayers, gameCourse, range, gameStrokes(active.map((p) => p.profileId === me ? scored.strokes : strokesOf(p.profileId)), par, 18, () => true), inputs) : null;
    write(null);
    setSave({ status: "saved", round: result.round, game });
    return { ok: true };
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="Back to Play (your round is kept)"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Round with friends{isHost ? " · you're the host" : ""}</p></header>
    <section className={styles.panel}>
      <h1 className={styles.title}>{setup.course.name}</h1>
      <p className={styles.place}>{[setup.tee?.name, holesLabel(setup.holes), def?.name, ended ? "Round ended" : null].filter(Boolean).join(" · ")}</p>
      {problem && <p className={styles.error} role="alert">{problem}</p>}
      {save.status !== "saved" && <ul className={styles.roster} aria-label="Players">
        {active.map((p) => <li key={p.profileId}><span>{p.profileId === me ? "You" : p.name}{p.profileId === snap.host && <small>Host</small>}</span>
          <b data-status={p.status}>{p.status === "joined" ? "Joined" : "Invited"}</b>
          {isHost && p.profileId !== me && !ended && <button type="button" className={styles.remove} aria-label={p.status === "invited" ? `Cancel ${p.name}'s invite` : `Remove ${p.name}`}
            onClick={() => hostAction({ action: "remove", profileId: p.profileId }, p.status === "invited" ? `Cancel ${p.name}'s invite?` : `Remove ${p.name} from the round?`)}><X size={16} aria-hidden="true" /></button>}
        </li>)}
      </ul>}
      {isHost && !ended && save.status !== "saved" && <div className={styles.hostMenu} role="group" aria-label="Host">
        <button type="button" className={styles.secondary} aria-expanded={menu === "players"} onClick={() => setMenu(menu === "players" ? null : "players")}>Invite more</button>
        <button type="button" className={styles.secondary} aria-expanded={menu === "game"} onClick={() => setMenu(menu === "game" ? null : "game")}>Change game</button>
        <button type="button" className={styles.secondary} onClick={() => hostAction({ action: "end" }, "End the round for everyone? Players can still submit their own card.")}>End round</button>
      </div>}
      {isHost && menu === "players" && !ended && (active.length < 5
        ? <div className={styles.form}><InvitePlayer taken={active.map((p) => p.profileId)} onInvite={(player) => { void hostAction({ action: "invite", profileId: player.profileId }); setMenu(null); }} /></div>
        : <p className={styles.note}>A round has up to 5 players.</p>)}
      {isHost && menu === "game" && !ended && <div className={styles.form}>
        <GamePicker gameId={setup.game?.id ?? ""} open={pickingGame} setOpen={setPickingGame} onPick={(gameId) => {
          const next = gameId ? gameDef(gameId) : null;
          void hostAction({ action: "setup", setup: { ...setup, game: next ? { id: next.id, net: !next.teamFormat && (setup.game?.net ?? false), birdiesDouble: next.points && (setup.game?.birdiesDouble ?? false) } : null } });
          setMenu(null);
        }} />
      </div>}
      {def && !gameFits && <p className={styles.needs}>{def.name} needs {playersLabel(def.players)}; there are {active.length} in the round, so it isn&apos;t scored right now.</p>}
      <RoundStatus save={save} onRetry={() => { setCard(read()?.card); setAttempt((n) => n + 1); setSave({ status: "idle" }); }}
        leave={<button type="button" className={styles.discard} onClick={() => { if (window.confirm("Leave this round on this phone? Scores already sent stay in the round.")) onLeave(); }}>Leave round on this phone</button>} />
    </section>
    {save.status !== "saved" && <GolfTripScoring key={attempt} solo startOpen={!card} stats={setup.stats} holeRange={range}
      par={par} courseName={setup.course.name} initialHoles={initialHoles} prefill={prefill} onSubmit={submit} remoteHoles={myRemote}
      onParChange={setup.course.custom && isHost && !ended ? (hole, value) => { const next = withPar(setup, hole, value); setSnap({ ...snap, setup: next }); saveBuiltPars(next.course.ref, next.course.par); void hostAction({ action: "setup", setup: next }); } : undefined}
      onCardChange={(next) => {
        setLiveCard(next); update(saved, { card: next });
        // Send only the holes I changed (compared with what the round already has for me, untouched = par).
        const sent = sentMine.current ??= par.map((p, h) => myRemote[h] ?? p);
        next.strokes.forEach((s, h) => { if (h >= range[0] && h < range[1] && s !== sent[h]) { sent[h] = s; sendStrokes(me, h, s); } });
      }}
      group={others.length ? {
        names: others.map((p) => `${firstName(p.name)}${p.status === "invited" ? " (inv.)" : ""}`),
        strokes: others.map((p) => strokesOf(p.profileId)),
        editable: others.map(() => isHost && !ended),
        onChange: (next) => next.forEach((row, g) => { const before = strokesOf(others[g].profileId); row.forEach((s, h) => { if (s !== before[h]) sendStrokes(others[g].profileId, h, s); }); }),
      } : undefined}
      gameSlot={setup.game && gameFits ? (hole) => <div className={styles.game}>
        <HolePicks game={setup.game!} hole={hole} range={range} names={gamePlayers.map((p) => p.name)} input={inputs[hole]} onChange={(part) => {
          const next = { ...inputs[hole], ...part };
          void send(`pick:${hole}`, next, { action: "pick", hole: hole + 1, pick: next });
        }} />
        <Standings result={scoreGame(setup.game!, gamePlayers, gameCourse, range, gameStrokes(active.map(rowFor), par, hole, touched), inputs)} compact />
      </div> : undefined} />}
  </main>;
}

/** The game's extra tap for this hole (Wolf partner, Daytona spots, Bingo Bango Bongo, Snake). */
function HolePicks({ game, hole, range, names, input, onChange }: { game: GameConfig; hole: number; range: [number, number]; names: string[]; input: HoleInput; onChange: (part: HoleInput) => void }) {
  const kind = gameDef(game.id).holeInput;
  const everyone = names.map((_, i) => i);
  // Tapping the chosen button again clears it (undefined = nothing picked).
  const pick = (label: string, chosen: number | null | undefined, choices: { value: number | null; label: string }[], set: (value: number | null | undefined) => void) =>
    <div className={styles.pickRow} role="group" aria-label={label}><span>{label}</span>
      {choices.map((choice) => <button key={String(choice.value)} type="button" aria-pressed={chosen === choice.value} onClick={() => set(chosen === choice.value ? undefined : choice.value)}>{choice.label}</button>)}
    </div>;
  if (kind === "wolf") {
    const wolf = wolfFor(hole, range, names.length);
    return pick(`Wolf: ${names[wolf]}. Partner`, input.wolfPartner, [...everyone.filter((i) => i !== wolf).map((i) => ({ value: i, label: names[i] })), { value: null, label: "Lone Wolf" }],
      (value) => onChange({ wolfPartner: value }));
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

function Standings({ result, compact = false }: { result: GameResult; compact?: boolean }) {
  return <div className={`${styles.standings} ${compact ? styles.standingsCompact : ""}`} aria-label={result.title}>
    <p className={styles.standingsTitle}>{result.title}</p>
    <ol>{result.standings.map((s, i) => <li key={i}><span>{s.label}</span><b>{s.value}</b></li>)}</ol>
    {result.note && <p className={styles.standingsNote}>{result.note}</p>}
  </div>;
}
