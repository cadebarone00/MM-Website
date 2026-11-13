"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, Lock, Shuffle, Settings, X } from "lucide-react";
import { GolfTripScoring } from "./GolfTripScoring";
import { GamePicker, HolePicks, playersLabel, Standings } from "./PlayRound";
import { applyLeagueChange, cardOf, drawPairs, gameCourse, groupOrder, leaderboard, makeTeeTimes, PAIR_FORMATS, PAIR_RULES, pairResults, pairsByPoints, SEGMENT_OPTIONS, skins, toParLabel, ungrouped, type League, type LeagueChange, type LeagueScoring, type PairFormat, type PairRule, type PairSegments } from "@/lib/platform/leagues";
import { teeTimeLabel, type TeeTiming } from "@/lib/platform/codeTournaments";
import { appHref } from "@/lib/app/appPaths";
import { DatePicker } from "./DatePicker";
import { InviteCodeCard } from "./InviteCodeCard";
import type { SheetCard } from "@/lib/platform/liveCards";
import { gameDef, scoreGame, type GameConfig, type GameId, type HoleInput } from "@/lib/platform/roundGames";
import playStyles from "./PlayRound.module.css";
import homeStyles from "./GolfTripHome.module.css";
import tourney from "./CodeTournament.module.css";
import styles from "./League.module.css";

type Section = "Leaderboard" | "Skins" | "Pairs" | "Group" | "Tee Times";
const firstName = (name: string) => name.split(" ")[0];
/** "T2" when more than one shares the place, as on golf leaderboards. */
const place = (position: number | null, all: (number | null)[]) => position == null ? "–" : all.filter((p) => p === position).length > 1 ? `T${position}` : String(position);
/** "2026-11-12" → "Thu, Nov 12". */
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** How often the page checks for everyone else's scores. */
const POLL_MS = 5000;
type Reply = { ok: boolean; message?: string; code?: string; id?: string };
const post = (id: string, body: object): Promise<Reply> => fetch(`/api/leagues/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ ...(await r.json().catch(() => ({}))) as Reply, ok: r.ok })).catch(() => ({ ok: false, message: "No connection. Try again when you're back online." }));
/** Changes to the same thing (one player's hole, one group's game) replace each other while they're sending. */
const changeKey = (c: LeagueChange) => c.action === "strokes" ? `strokes:${c.player}:${c.hole}` : c.action === "game" || c.action === "submit" ? `${c.action}:${c.group}` : c.action;
export type Act = (change: LeagueChange) => Promise<Reply>;

/**
 * A league (project_specs.md "Feature: Leagues", /leagues/<id>): one round for everyone in it. The first screen is a very
 * basic leaderboard (total strokes, Gross or Net); then league-wide Skins, the random 2-person Pairs game with its 6 / 9 /
 * 18 hole winners, my Group's own game, and the Tee Times. Each group's scorer keeps the whole group's card with the golf
 * trip's scorecard. The organizer's settings wheel opens League Settings. Everyone's scores refresh every few seconds.
 * `sample` (the dev preview, /dev/leagues): a made-up league; changes stay on this page and nothing is sent.
 */
export function LeagueHome({ id, sample }: { id?: string; sample?: { league: League; meId: string } }) {
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(sample?.league ?? null);
  const [meId, setMeId] = useState<string | null>(sample?.meId ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("Leaderboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Changes sent but not saved yet, kept on top of each refresh so a refresh never undoes them. */
  const pending = useRef(new Map<string, LeagueChange>());
  const sending = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async () => {
    if (sample || !id) return;
    const reply = await fetch(`/api/leagues/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; league?: League; me?: string; code?: string }>).catch(() => null);
    if (reply?.ok && reply.league && reply.me) { setLeague([...pending.current.values()].reduce(applyLeagueChange, reply.league)); setMeId(reply.me); setProblem(null); return; }
    setProblem(reply === null ? "No connection. Scores will refresh when you're back online."
      : reply.code === "not_member" ? "You're not in this league. Join it with its code on the Leagues tab."
      : reply.code === "not_installed" ? "Leagues aren't set up in the database yet (supabase/leagues.sql)." : "Couldn't load the league. Trying again…");
  }, [id, sample]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  // Every change shows at once, then goes to the league one after another (the preview keeps it on this page).
  const act: Act = (change) => {
    setLeague((current) => current && applyLeagueChange(current, change));
    if (sample || !id) return Promise.resolve({ ok: true });
    const key = changeKey(change);
    pending.current.set(key, change);
    const result = (sending.current = sending.current.then(() => post(id, change))) as Promise<Reply>;
    return result.then((reply) => {
      if (pending.current.get(key) === change) pending.current.delete(key);
      setProblem(reply.ok ? null : reply.message ?? "A change didn't save. Try again.");
      void load();
      return reply;
    });
  };

  const back = <Link href={sample ? "/dev" : "/leagues"} className={tourney.back}><ChevronLeft size={18} aria-hidden="true" /> Leagues</Link>;
  if (!league || !meId) return <main className={homeStyles.page}>{back}<p className={tourney.status} role={problem ? "alert" : undefined}>{problem ?? "Loading the league…"}</p></main>;

  const isOrganizer = league.organizer === meId;
  const myGroup = league.groups.find((g) => g.players.includes(meId)) ?? null;
  const live = league.status === "live";
  const sections: Section[] = ["Leaderboard", ...(league.skins.on ? ["Skins" as const] : []), ...(league.pairs.on ? ["Pairs" as const] : []), ...(myGroup ? ["Group" as const] : []), "Tee Times"];
  const tab = sections.includes(section) ? section : "Leaderboard";
  const settings = (next: Partial<Pick<League, "scoring" | "skins" | "pairs">>) => act({ action: "settings", scoring: next.scoring ?? league.scoring, skins: next.skins ?? league.skins, pairs: next.pairs ?? league.pairs });
  const game = (group: League["groups"][number], next: Partial<{ game: League["groups"][number]["game"]; inputs: League["groups"][number]["inputs"] }>) =>
    act({ action: "game", group: group.number, game: next.game !== undefined ? next.game : group.game ?? null, inputs: next.inputs ?? group.inputs ?? [] });

  if (settingsOpen && isOrganizer) return <LeagueSettings league={league} sample={Boolean(sample)} problem={problem} onClose={() => setSettingsOpen(false)} onSettings={settings} act={act}
    onCopy={async (date) => {
      if (sample || !id) return "The preview doesn't save a copy.";
      const reply = await post(id, { action: "copy", date });
      if (!reply.ok || !reply.id) return reply.message ?? "Couldn't copy the league. Try again.";
      router.push(appHref(`/leagues/${reply.id}`)); return null;
    }}
    onDelete={async () => {
      if (sample || !id) return "The preview can't be deleted.";
      const reply = await fetch(`/api/leagues/${encodeURIComponent(id)}`, { method: "DELETE" }).then(async (r) => ({ ...(await r.json().catch(() => ({}))) as Reply, ok: r.ok })).catch(() => ({ ok: false, message: undefined } as Reply));
      if (!reply.ok) return reply.message ?? "Couldn't delete the league. Try again.";
      router.replace("/leagues"); return null;
    }} />;

  return <main className={`${homeStyles.page} ${myGroup?.scorer === meId && live ? homeStyles.pageWithScoring : ""}`}>
    <div className={tourney.topBar}>
      {back}
      {isOrganizer && <button type="button" className={`${homeStyles.iconButton} ${tourney.settingsButton}`} aria-label="League settings" onClick={() => setSettingsOpen(true)}><Settings size={24} strokeWidth={1.75} aria-hidden /></button>}
    </div>
    <h1 className={tourney.name}>{league.name}</h1>
    <header className={styles.courseBar}>
      <p>{!live ? "Final" : league.date === new Date().toLocaleDateString("en-CA") ? "Today" : dayLabel(league.date)} · {league.players.length} {league.players.length === 1 ? "player" : "players"}{league.groups.length ? ` · ${league.groups.length} ${league.groups.length === 1 ? "group" : "groups"}` : ""}</p>
      <h2>{league.course.name}</h2>
    </header>
    {problem && <p className={tourney.status} role="alert">{problem}</p>}
    <div className={styles.tabs} role="tablist" aria-label="League sections">
      {sections.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} className={styles.tab} onClick={() => setSection(name)}>{name}</button>)}
    </div>
    {tab === "Leaderboard" ? <Leaderboard league={league} meId={meId} onScoring={isOrganizer && live ? (scoring) => void settings({ scoring }) : undefined} />
      : tab === "Skins" ? <SkinsView league={league} isOrganizer={isOrganizer && live} onCarryover={(carryover) => void settings({ skins: { ...league.skins, carryover } })} />
      : tab === "Pairs" ? <PairsView league={league} meId={meId} />
      : tab === "Group" && myGroup ? <GroupGame league={league} group={myGroup} meId={meId} editable={live && !myGroup.submitted} onGame={(next) => void game(myGroup, { game: next, inputs: [] })} />
      : <GroupsView league={league} meId={meId} isOrganizer={isOrganizer} />}
    {live && myGroup && myGroup.scorer !== meId && <p className={tourney.status}>{league.players.find((p) => p.profileId === myGroup.scorer)?.name ?? "Your scorer"} keeps your group&apos;s card.</p>}
    {live && myGroup?.scorer === meId && <GroupScoring key={myGroup.number} league={league} group={myGroup} meId={meId}
      onStrokes={(updates) => updates.forEach((u) => void act({ action: "strokes", player: u.profileId, hole: u.hole + 1, strokes: u.strokes }))}
      onInput={(hole, part) => void game(myGroup, { inputs: Array.from({ length: 18 }, (_, h) => h === hole ? { ...myGroup.inputs?.[h], ...part } : myGroup.inputs?.[h] ?? {}) })}
      onSubmit={() => act({ action: "submit", group: myGroup.number })} />}
  </main>;
}

/** The first screen: everyone's total strokes so far, Gross or Net. Only the organizer gets the Gross / Net switch
 *  (it's the league's setting); everyone else sees the league the way the organizer set it. */
function Leaderboard({ league, onScoring, meId }: { league: League; onScoring?: (s: LeagueScoring) => void; meId: string }) {
  const scoring = league.scoring;
  const rows = leaderboard(league, scoring);
  return <section aria-label="Leaderboard">
    {onScoring && <div className={styles.toggle} role="radiogroup" aria-label="Scoring">
      {(["Gross", "Net"] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={scoring === s} onClick={() => onScoring(s)}>{s}</button>)}
    </div>}
    <table className={styles.board}>
      <thead><tr><th scope="col">Pos</th><th scope="col">Player</th><th scope="col">To par</th><th scope="col">Thru</th><th scope="col">{scoring}</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.profileId} data-me={r.profileId === meId || undefined}>
        <td>{place(r.position, rows.map((x) => x.position))}</td><th scope="row">{r.name}</th><td className={styles.toPar} data-under={(r.toPar ?? 0) < 0 || undefined}>{toParLabel(r.toPar)}</td>
        <td>{r.thru === 0 ? "–" : r.thru === 18 ? "F" : r.thru}</td><td className={styles.total}>{r.total ?? "–"}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}

/** League-wide skins: who has won, then each hole. The organizer can turn carryover on or off right here. */
function SkinsView({ league, isOrganizer, onCarryover }: { league: League; isOrganizer: boolean; onCarryover: (on: boolean) => void }) {
  const result = skins(league);
  const nameOf = (id: string | null) => league.players.find((p) => p.profileId === id)?.name ?? "";
  return <section aria-label="Skins">
    {isOrganizer && <label className={styles.switchRow}>
      <span>Carryover</span>
      <input type="checkbox" role="switch" checked={league.skins.carryover} onChange={(e) => onCarryover(e.target.checked)} />
    </label>}
    {result.totals.length > 0 && <ul className={styles.list}>{result.totals.map((t) => <li key={t.profileId}><span>{t.name}</span><b>{t.skins}</b></li>)}</ul>}
    <ol className={styles.holes}>{result.holes.map((h) => <li key={h.hole} data-status={h.status}>
      <span className={styles.holeNumber}>{h.hole}</span>
      <span>{h.status === "won" ? nameOf(h.winner) : h.status === "tied" ? "Tie" : ""}</span>
      {h.status === "won" && h.value > 1 && <b>×{h.value}</b>}
    </li>)}</ol>
  </section>;
}

/** The 2-person pairs game: the teams, then a leaderboard for each segment (6, 9 or 18 holes). */
function PairsView({ league, meId }: { league: League; meId: string }) {
  const format = PAIR_FORMATS.find((f) => f.id === league.pairs.format)!;
  if (!league.pairs.locked) return <p className={tourney.status}>The pairs haven&apos;t been drawn yet. The organizer draws them in League Settings.</p>;
  const points = pairsByPoints(league.pairs.format);
  return <section aria-label="Pairs">
    <p className={styles.note}>{format.name} · {league.pairs.net ? "Net" : "Gross"} · {SEGMENT_OPTIONS.find((s) => s.value === league.pairs.segments)!.name}</p>
    {pairResults(league).map((segment) => <div key={segment.label} className={styles.segment}>
      <h3 className={styles.heading}>{segment.label}{segment.final ? " · Final" : ""}</h3>
      {segment.final && <p className={styles.winner}>{segment.winners.length > 1 ? "Tied: " : "Winners: "}{segment.winners.map((team) => team.map((id) => firstName(league.players.find((p) => p.profileId === id)?.name ?? "")).join(" & ")).join(", ")}</p>}
      <table className={styles.board}>
        <thead><tr><th scope="col">Pos</th><th scope="col">Pair</th><th scope="col">Thru</th><th scope="col">{points ? "Points" : "To par"}</th></tr></thead>
        <tbody>{segment.standings.map((s) => <tr key={s.team.join()} data-me={s.team.includes(meId) || undefined}>
          <td>{place(s.position, segment.standings.map((x) => x.position))}</td><th scope="row">{s.names}</th><td>{s.thru || "–"}</td>{points ? <td className={styles.total}>{s.total ?? "–"}</td> : <td className={`${styles.total} ${styles.toPar}`} data-under={(s.toPar ?? 0) < 0 || undefined}>{toParLabel(s.toPar)}</td>}
        </tr>)}</tbody>
      </table>
    </div>)}
  </section>;
}

/** Tee Times: each playing group's tee time, scorer and players, and anyone not in a group yet. */
function GroupsView({ league, meId, isOrganizer }: { league: League; meId: string; isOrganizer: boolean }) {
  const loose = ungrouped(league);
  if (!league.groups.length) return <p className={tourney.status}>No tee times yet.{isOrganizer ? " Make them in League Settings once your players have joined." : " The organizer will set them."}</p>;
  return <section aria-label="Tee Times" className={styles.groups}>
    {loose.length > 0 && <p className={styles.note}>Not in a group yet: {loose.map((p) => p.name).join(", ")}</p>}
    {league.groups.map((g) => {
    const thru = Math.min(...g.players.map((id) => cardOf(league, id).filter((s) => s != null).length));
    return <article key={g.number} className={styles.group} data-me={g.players.includes(meId) || undefined}>
      <header><h3>Group {g.number}</h3><span>{g.time ? teeTimeLabel(g.time) : "Time TBD"} · Hole {g.hole} · {g.submitted ? "Card in" : thru === 0 ? "Not started" : thru === 18 ? "Finished" : `Thru ${thru}`}</span></header>
      <ul>{g.players.map((id) => { const p = league.players.find((x) => x.profileId === id)!; return <li key={id}>
        <span>{p.name}{id === g.scorer && <small>Scorer</small>}</span><b>{p.handicap == null ? "–" : p.handicap.toFixed(1)}</b>
      </li>; })}</ul>
    </article>;
  })}</section>;
}

/** The scorer keeps the whole group's card: their own scores, and everyone else's in the group, with the trip's scorecard. */
function GroupScoring({ league, group, meId, onStrokes, onInput, onSubmit }: { league: League; group: League["groups"][number]; meId: string; onStrokes: (updates: { profileId: string; hole: number; strokes: number | null }[]) => void; onInput: (hole: number, part: HoleInput) => void; onSubmit: () => Promise<Reply> }) {
  const game = groupGame(league, group);
  const others = group.players.filter((id) => id !== meId);
  const nameOf = (id: string) => league.players.find((p) => p.profileId === id)?.name ?? "Player";
  const [initial] = useState(() => cardOf(league, meId));
  const submitted = Boolean(group.submitted);
  const onCardChange = (card: SheetCard) => {
    const mine = cardOf(league, meId);
    onStrokes(card.strokes.flatMap((s, h) => h < 18 && s !== mine[h] ? [{ profileId: meId, hole: h, strokes: s }] : []));
  };
  return <GolfTripScoring solo stats={false} gps={false} parIsReference par={league.course.par} courseName={league.course.name}
    playerName={nameOf(meId)} initialHoles={initial}
    submittedCard={submitted ? { strokes: cardOf(league, meId).map((s) => s ?? 0), putts: [], fairways: [], greens: [], penalties: [] } : undefined}
    onCardChange={onCardChange}
    group={{
      names: others.map((id) => firstName(nameOf(id))),
      strokes: others.map((id) => cardOf(league, id)),
      editable: others.map(() => !submitted),
      onChange: (rows) => onStrokes(rows.flatMap((row, g) => { const before = cardOf(league, others[g]); return row.flatMap((s, h) => s !== before[h] ? [{ profileId: others[g], hole: h, strokes: s }] : []); })),
    }}
    gameSlot={game ? (hole) => <div className={playStyles.game}>
      <HolePicks game={game.config} hole={hole} range={[0, 18]} names={game.names} input={group.inputs?.[hole] ?? {}} onChange={(part) => onInput(hole, part)} />
      <Standings result={game.result} compact />
    </div> : undefined}
    onSubmit={async () => { const reply = await onSubmit(); return reply.ok ? { ok: true } : { ok: false, message: reply.message ?? "Couldn't submit. Try again." }; }} />;
}

/** The group's game and how it stands, once the group has one that fits its size (scorer = player 0, as in Play a round). */
function groupGame(league: League, group: League["groups"][number]) {
  const config = group.game;
  if (!config || !gameDef(config.id).players.includes(group.players.length)) return null;
  const order = groupOrder(group);
  const players = order.map((id) => league.players.find((p) => p.profileId === id)!);
  const names = players.map((p) => firstName(p.name));
  const result = scoreGame(config, players.map((p) => ({ name: firstName(p.name), handicap: p.handicap })), gameCourse(league.course), [0, 18], order.map((id) => cardOf(league, id)), group.inputs ?? []);
  return { config, names, result };
}

/**
 * Group: my group's own game, exactly like Play a round. The group's scorer picks it (the same game sheet, teams, Net and
 * Birdies double); everyone in the group sees how it stands. Per-hole picks (Wolf partner, Bingo Bango Bongo…) go on
 * the scorer's card.
 */
function GroupGame({ league, group, meId, editable, onGame }: { league: League; group: League["groups"][number]; meId: string; editable: boolean; onGame: (game: GameConfig | null) => void }) {
  const [picking, setPicking] = useState(false);
  const isScorer = group.scorer === meId && editable;
  const config = group.game ?? null;
  const def = config ? gameDef(config.id) : null;
  const size = group.players.length;
  const fits = !def || def.players.includes(size);
  const playing = groupGame(league, group);
  const order = groupOrder(group);
  const nameOf = (id: string) => firstName(league.players.find((p) => p.profileId === id)?.name ?? "Player");
  const teams = config?.teams ?? order.map((_, i) => i < size / 2 ? 0 : 1);
  const pick = (id: GameId | "") => {
    if (!id) { onGame(null); return; }
    const next = gameDef(id);
    onGame({ id, net: !next.teamFormat && (config?.net ?? false), birdiesDouble: next.points && (config?.birdiesDouble ?? false), ...(next.teams ? { teams: order.map((_, i) => i < size / 2 ? 0 : 1) } : {}) });
  };
  if (!isScorer && !config) return <p className={tourney.status}>No group game. {nameOf(group.scorer)} can pick one.</p>;
  return <section aria-label="Group game" className={`${playStyles.form} ${styles.groupGame}`}>
    {isScorer ? <>
      <GamePicker gameId={config?.id ?? ""} onPick={pick} open={picking} setOpen={setPicking} />
      {def && <p className={playStyles.blurb}>{def.blurb}</p>}
      {def && !fits && <p className={playStyles.needs} role="status">{def.name} needs {playersLabel(def.players)}; your group has {size}.</p>}
      {config && def && fits && def.teams && size > 2 && <div className={playStyles.teams} role="group" aria-label="Teams">
        {order.map((id, i) => <button key={id} type="button" aria-pressed={teams[i] === 1} onClick={() => onGame({ ...config, teams: teams.map((t, j) => j === i ? 1 - t : t) })}>
          {nameOf(id)} <b>{teams[i] === 0 ? "Team 1" : "Team 2"}</b></button>)}
      </div>}
      {config && def && !def.teamFormat && <label className={playStyles.toggle}><span>Net (use handicaps)<small>Each player gets strokes from their handicap</small></span><input type="checkbox" role="switch" checked={config.net} onChange={(e) => onGame({ ...config, net: e.target.checked })} /></label>}
      {config && def?.points && <label className={playStyles.toggle}><span>Birdies double points<small>A hole won with a birdie or better is worth double</small></span><input type="checkbox" role="switch" checked={config.birdiesDouble} onChange={(e) => onGame({ ...config, birdiesDouble: e.target.checked })} /></label>}
    </> : <p className={playStyles.blurb}>{def?.name}{config?.net ? " · Net" : ""}{fits ? "" : ` needs ${playersLabel(def?.players ?? [])}; not scored right now.`}</p>}
    {playing && <Standings result={playing.result} />}
  </section>;
}

/**
 * League Settings (organizer): the join code to share; the tee times (make them, move players, pick each group's scorer);
 * skins; the pairs game (format, gross / net, winner segments, draw rule, draw and lock); then Copy, End and Delete.
 */
function LeagueSettings({ league, sample, problem, onClose, onSettings, act, onCopy, onDelete }: { league: League; sample: boolean; problem: string | null; onClose: () => void;
  onSettings: (next: Partial<Pick<League, "scoring" | "skins" | "pairs">>) => Promise<Reply>; act: Act; onCopy: (date: string) => Promise<string | null>; onDelete: () => Promise<string | null> }) {
  const pairs = league.pairs;
  const setPairs = (next: Partial<League["pairs"]>) => void onSettings({ pairs: { ...pairs, ...next } });
  const setSkins = (next: Partial<League["skins"]>) => void onSettings({ skins: { ...league.skins, ...next } });
  const nameOf = (id: string) => league.players.find((p) => p.profileId === id)?.name ?? "Player";
  const started = league.holes.length > 0;
  const live = league.status === "live";
  return <main className={homeStyles.page}>
    <div className={tourney.topBar}>
      <span />
      <button type="button" className={homeStyles.iconButton} aria-label="Close settings" onClick={onClose}><X size={24} aria-hidden /></button>
    </div>
    <h1 className={tourney.name}>League Settings</h1>
    {problem && <p className={tourney.status} role="alert">{problem}</p>}
    <InviteCodeCard kind="league" id={league.id} code={league.code} name={league.name} canEmail={!sample && live} />

    {live && <TeeTimesEditor league={league} onGroups={(groups) => void act({ action: "groups", groups })} />}

    {live && <section className={styles.card} aria-labelledby="skins-settings">
      <h2 id="skins-settings">Skins</h2>
      <Choice label="League-wide skins" value={league.skins.on ? "on" : "off"} options={[{ id: "on", name: "On" }, { id: "off", name: "Off" }]} onPick={(v) => setSkins({ on: v === "on" })} />
      {league.skins.on && <>
        <Choice label="Scoring" value={league.skins.net ? "net" : "gross"} options={[{ id: "gross", name: "Gross" }, { id: "net", name: "Net" }]} onPick={(v) => setSkins({ net: v === "net" })} />
        <Choice label="Ties" value={league.skins.carryover ? "carry" : "none"} options={[{ id: "carry", name: "Carry over" }, { id: "none", name: "No skin" }]} onPick={(v) => setSkins({ carryover: v === "carry" })} />
      </>}
    </section>}

    {live && <section className={styles.card} aria-labelledby="pairs-settings">
      <h2 id="pairs-settings">2-person pairs</h2>
      <Choice label="Pairs game" value={pairs.on ? "on" : "off"} options={[{ id: "on", name: "On" }, { id: "off", name: "Off" }]} onPick={(v) => setPairs({ on: v === "on" })} />
      {pairs.on && <>
        <Choice label="Format" value={pairs.format} options={PAIR_FORMATS} onPick={(v) => setPairs({ format: v as PairFormat })} />
        <p className={styles.help}>{PAIR_FORMATS.find((f) => f.id === pairs.format)!.blurb}</p>
        <Choice label="Scoring" value={pairs.net ? "net" : "gross"} options={[{ id: "gross", name: "Gross" }, { id: "net", name: "Net" }]} onPick={(v) => setPairs({ net: v === "net" })} />
        <Choice label="Winners" value={String(pairs.segments)} options={SEGMENT_OPTIONS.map((o) => ({ id: String(o.value), name: o.name }))} onPick={(v) => setPairs({ segments: Number(v) as PairSegments })} />
        <Choice label="How pairs are drawn" value={pairs.rule} options={PAIR_RULES} onPick={(v) => setPairs({ rule: v as PairRule, locked: false })} disabled={pairs.locked} />
        <p className={styles.help}>{PAIR_RULES.find((r) => r.id === pairs.rule)!.blurb}</p>
        {pairs.teams.length > 0 && <ol className={styles.pairList} aria-label="Pairs">{pairs.teams.map((team, i) => <li key={team.join()}><span>{i + 1}</span>{team.map(nameOf).join(" & ")}</li>)}</ol>}
        <div className={styles.actions}>
          {!pairs.locked && <button type="button" className={tourney.organizerButton} disabled={league.players.length < 2} onClick={() => setPairs({ teams: drawPairs(league, pairs.rule) })}><Shuffle size={15} aria-hidden="true" /> {pairs.teams.length ? "Re-draw" : "Draw pairs"}</button>}
          {!pairs.locked && pairs.teams.length > 0 && <button type="button" className={tourney.organizerButton} onClick={() => setPairs({ locked: true })}><Lock size={15} aria-hidden="true" /> Lock pairs</button>}
          {pairs.locked && !started && <button type="button" className={tourney.organizerButton} onClick={() => setPairs({ locked: false })}>Unlock to re-draw</button>}
        </div>
        {league.players.length < 2 && <p className={styles.help}>Pairs can be drawn once players have joined.</p>}
        {pairs.locked && <p className={styles.help}>{started ? "Locked. Pairs can't change once scores are in." : "Locked. Everyone sees these pairs."}</p>}
        {pairs.teams.length > 0 && ungrouped({ players: league.players, groups: pairs.teams.map((team, i) => ({ number: i + 1, time: "", hole: 1, scorer: team[0], players: team })) }).length > 0
          && <p className={styles.help}>Someone joined after the pairs were drawn. {pairs.locked && started ? "They aren't in a pair." : "Re-draw to include them."}</p>}
      </>}
    </section>}

    <LeagueActions league={league} sample={sample} act={act} onCopy={onCopy} onDelete={onDelete} />
  </main>;
}

const EVERY = [8, 9, 10, 12, 15];
const STARTS: { id: TeeTiming["start"]; name: string }[] = [{ id: "1", name: "Off 1" }, { id: "1&10", name: "Off 1 & 10" }, { id: "shotgun", name: "Shotgun" }];
type DraftGroup = { time: string; hole: number; scorer: string; players: string[] };

/**
 * Tee Times (organizer): make them (everyone shuffled into foursomes on the timing picked), then change any group's
 * time, starting hole or scorer, move a player to another group (or a new one), or put in someone who joined later.
 * Every change saves the whole set (a group whose players change starts its own game over).
 */
function TeeTimesEditor({ league, onGroups }: { league: League; onGroups: (groups: DraftGroup[]) => void }) {
  const [timing, setTiming] = useState<TeeTiming>({ first: "08:00", every: 10, start: "1" });
  const groups: DraftGroup[] = league.groups.map((g) => ({ time: g.time, hole: g.hole, scorer: g.scorer, players: g.players }));
  const loose = ungrouped(league);
  const nameOf = (id: string) => league.players.find((p) => p.profileId === id)?.name ?? "Player";
  const save = (next: DraftGroup[]) => onGroups(next.filter((g) => g.players.length).map((g) => ({ ...g, scorer: g.players.includes(g.scorer) ? g.scorer : g.players[0] })));
  /** Move a player to group `to` (an index; groups.length = a new group). */
  const move = (id: string, to: number) => {
    const next = groups.map((g) => ({ ...g, players: g.players.filter((x) => x !== id) }));
    if (to >= next.length) next.push({ time: next.at(-1)?.time ?? timing.first, hole: 1, scorer: id, players: [id] });
    else next[to] = { ...next[to], players: [...next[to].players, id] };
    save(next);
  };
  const edit = (i: number, part: Partial<DraftGroup>) => save(groups.map((g, j) => j === i ? { ...g, ...part } : g));
  const make = () => {
    if (groups.length && !window.confirm("Make new tee times for everyone? The groups you have now are replaced.")) return;
    save(makeTeeTimes(league.players.map((p) => p.profileId), timing));
  };
  const target = (id: string, current: number | null) => <select className={styles.select} aria-label={`Move ${nameOf(id)}`} value="" onChange={(e) => move(id, Number(e.target.value))}>
    <option value="" disabled>{current == null ? "Add to…" : "Move to…"}</option>
    {groups.map((g, j) => j !== current && g.players.length < 5 && <option key={j} value={j}>Group {j + 1}</option>)}
    <option value={groups.length}>New group</option>
  </select>;

  return <section className={styles.card} aria-labelledby="tee-times-settings">
    <h2 id="tee-times-settings">Tee Times</h2>
    <div className={styles.timing}>
      <label><span>First tee time</span><input type="time" className={styles.select} value={timing.first} onChange={(e) => setTiming({ ...timing, first: e.target.value || timing.first })} /></label>
      <label><span>Every</span><select className={styles.select} value={timing.every} onChange={(e) => setTiming({ ...timing, every: Number(e.target.value) })}>{EVERY.map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
      <label><span>Start</span><select className={styles.select} value={timing.start} onChange={(e) => setTiming({ ...timing, start: e.target.value as TeeTiming["start"] })}>{STARTS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    </div>
    <div className={styles.actions}>
      <button type="button" className={tourney.organizerButton} disabled={!league.players.length} onClick={make}><Shuffle size={15} aria-hidden="true" /> {groups.length ? "Re-make tee times" : "Make tee times"}</button>
    </div>
    {!league.players.length && <p className={styles.help}>Tee times can be made once players have joined.</p>}
    {loose.length > 0 && groups.length > 0 && <div className={styles.editGroup}>
      <h3>Not in a group</h3>
      <ul>{loose.map((p) => <li key={p.profileId}><span>{p.name}</span>{target(p.profileId, null)}</li>)}</ul>
    </div>}
    {groups.map((g, i) => <div key={i} className={styles.editGroup}>
      <h3>Group {i + 1}{league.groups[i]?.submitted ? " · Card in" : ""}</h3>
      <div className={styles.timing}>
        <label><span>Time</span><input type="time" className={styles.select} value={g.time} onChange={(e) => edit(i, { time: e.target.value })} /></label>
        <label><span>Hole</span><select className={styles.select} value={g.hole} onChange={(e) => edit(i, { hole: Number(e.target.value) })}>{Array.from({ length: 18 }, (_, h) => <option key={h} value={h + 1}>{h + 1}</option>)}</select></label>
        <label><span>Scorer</span><select className={styles.select} value={g.scorer} onChange={(e) => edit(i, { scorer: e.target.value })}>{g.players.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select></label>
      </div>
      <ul>{g.players.map((id) => <li key={id}><span>{nameOf(id)}</span>{target(id, i)}</li>)}</ul>
    </div>)}
  </section>;
}

/** Copy (next time's league: same players and settings, a new date), End (scores lock) and Delete (gone for everyone). */
function LeagueActions({ league, sample, act, onCopy, onDelete }: { league: League; sample: boolean; act: Act; onCopy: (date: string) => Promise<string | null>; onDelete: () => Promise<string | null> }) {
  const [copyDate, setCopyDate] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<string | null>) => { setBusy(true); setNote(await task()); setBusy(false); };
  return <section className={styles.card} aria-labelledby="league-actions">
    <h2 id="league-actions">League</h2>
    {copyDate === null ? <div className={styles.actions}>
      <button type="button" className={tourney.organizerButton} onClick={() => setCopyDate(new Date().toLocaleDateString("en-CA"))}><Copy size={15} aria-hidden="true" /> Copy this league</button>
      {league.status === "live" && <button type="button" className={tourney.organizerButton} disabled={busy} onClick={() => { if (window.confirm("End the league? Scores lock and it moves to Past.")) void run(async () => { const r = await act({ action: "end" }); return r.ok ? null : r.message ?? "Couldn't end the league."; }); }}>End league</button>}
      <button type="button" className={`${tourney.organizerButton} ${styles.danger}`} disabled={busy} onClick={() => { if (window.confirm(`Delete ${league.name} for everyone? This can't be undone.`)) void run(onDelete); }}>Delete league</button>
    </div> : <div className={styles.copyRow}>
      <p className={styles.help}>A new league with the same players and settings. Tee times and pairs start fresh.</p>
      <label className={styles.timing}><span>New date</span><DatePicker value={copyDate} min={new Date().toLocaleDateString("en-CA")} onChange={(e) => setCopyDate(e.target.value || copyDate)} /></label>
      <div className={styles.actions}>
        <button type="button" className={tourney.organizerButton} disabled={busy} onClick={() => void run(() => onCopy(copyDate))}>{busy ? "Copying…" : "Make the copy"}</button>
        <button type="button" className={tourney.organizerButton} onClick={() => setCopyDate(null)}>Cancel</button>
      </div>
    </div>}
    {note && <p className={styles.help} role="alert">{note}</p>}
    {sample && <p className={styles.help}>Preview: nothing here is saved.</p>}
  </section>;
}

/** A row of buttons, one picked (League Settings). */
function Choice({ label, value, options, onPick, disabled = false }: { label: string; value: string; options: { id: string; name: string }[]; onPick: (id: string) => void; disabled?: boolean }) {
  return <div className={styles.choice}>
    <span>{label}</span>
    <div role="radiogroup" aria-label={label}>{options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={value === o.id} disabled={disabled && value !== o.id} onClick={() => onPick(o.id)}>{o.name}</button>)}</div>
  </div>;
}
