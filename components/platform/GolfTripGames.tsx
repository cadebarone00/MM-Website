"use client";

import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Dot, Plus } from "lucide-react";
import homeStyles from "./GolfTripHome.module.css";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { sampleTripGames } from "@/lib/dev/sampleTripGames";
import { HolePicks, Standings } from "./PlayRound";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { gameDef, gamesFor, scoreGame, wolfFor, type GameConfig, type GameId, type GameResult, type HoleInput } from "@/lib/platform/roundGames";
import { currentHole, gameCourse, gamePlayers, gameStrokes, groupOf, holesThru, meOn, parThru, snakeFromPutts, type TripGame } from "@/lib/platform/tripGames";
import styles from "./GolfTripGames.module.css";

/**
 * Golf trip → Games (owner request 2026-10-17): Play a round's games (same rules, same `scoreGame`), only with people
 * in your group. New game: round → players → game. The game then asks its pre-round options (scoring, birdies double,
 * teams) and Start begins it; during the round it shows the hole's pick (Wolf partner, Daytona spots, …) and the
 * standings, scored from the scorecard. Preview: games are kept on this device.
 */
const STORE = "golfTripRoundGames";
const readGames = (): TripGame[] => { try { return JSON.parse(localStorage.getItem(STORE) ?? "[]"); } catch { return []; } };
const firstName = (name: string) => name.split(/\s+/)[0];

export function GolfTripGames({ match, rounds, signedInName }: { match: GolfMatchPreview; rounds: number[]; signedInName?: string | null }) {
  const me = meOn(match, signedInName) ?? "You";
  const group = groupOf(match, me);
  const [games, setGames] = useState<TripGame[]>([]);
  // App simulator "Sample games, mid-round": made-up games partway through the round (kept in memory, never saved).
  const sample = useSimulator()?.state.sampleGames === true;
  const groupKey = group.join("|");
  const holeCount = match.par.length, shownRound = match.round;
  const fieldKey = match.leaderboard.map((row) => row.golfer.name).join("|");
  useEffect(() => { setGames(sample ? sampleTripGames(shownRound, holeCount, groupKey.split("|"), fieldKey.split("|")) : readGames()); }, [sample, shownRound, holeCount, groupKey, fieldKey]); // eslint-disable-line react-hooks/set-state-in-effect -- loads this device's saved games (or the sample) when the source changes
  const save = (next: TripGame[]) => { setGames(next); if (!sample) try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private mode */ } };
  const [creating, setCreating] = useState(false);
  // The sheet's box: top just covers the trip tabs; it runs to the bottom of the screen, over the bottom nav.
  const [sheetBox, setSheetBox] = useState({ top: 16, bottom: 16 });
  const openNew = () => {
    const tabs = document.querySelector("[aria-label='Trip sections']")?.getBoundingClientRect();
    setSheetBox({ top: Math.max(16, tabs?.top ?? 16), bottom: 0 });
    setCreating(true);
  };
  const mine = games.filter((g) => g.players.includes(me));

  return <section className={styles.root} aria-label="Games">
    <header className={styles.gamesHeader}>
      <h2 className={styles.activeGamesTitle}>Your games</h2>
      <button type="button" className={homeStyles.itineraryAddPill} aria-haspopup="dialog" onClick={openNew}><Plus size={16} strokeWidth={2.5} aria-hidden />New game</button>
    </header>
    <p className={styles.summary}>Games are with your group: {group.map(firstName).join(", ")}.</p>
    {mine.length === 0 && <p className={styles.emptyGames}>No games yet. Tap New game, pick a round and a game, and it scores itself from the scorecard.</p>}
    {mine.map((game) => {
      const update = (next: Partial<TripGame>) => save(games.map((g) => g.key === game.key ? { ...g, ...next } : g));
      const remove = () => save(games.filter((g) => g.key !== game.key));
      return game.started ? <GameCard key={game.key} game={game} match={match} onRemove={remove}
        onInput={(hole, part) => update({ inputs: Object.assign([...game.inputs], { [hole]: { ...game.inputs[hole], ...part } }) })} />
        : <PreRound key={game.key} game={game} onChange={(config) => update({ config })} onStart={() => update({ started: true })} onRemove={remove} />;
    })}
    {creating && <NewGame box={sheetBox} group={group} rounds={rounds.length ? rounds : [match.round]} current={match.round} onClose={() => setCreating(false)}
      onCreate={(game) => { save([...games, game]); setCreating(false); }} />}
  </section>;
}

/** A game during its round: hole picker for the extra pick, then the standings (scored by Play's own rules). */
function GameCard({ game, match, onInput, onRemove }: { game: TripGame; match: GolfMatchPreview; onInput: (hole: number, part: HoleInput) => void; onRemove: () => void }) {
  const def = gameDef(game.config.id);
  const holes = match.par.length, range: [number, number] = [0, holes];
  const strokes = gameStrokes(match, game);
  const live = match.round === game.round;
  const now = currentHole(strokes, holes);
  const [shown, setShown] = useState<number | null>(null);
  const hole = shown ?? now;
  const players = gamePlayers(match, game.players);
  // Snake reads the scorecard's putts (no buttons); every other game uses the picks made on the card.
  const inputs = def.holeInput === "snake" ? snakeFromPutts(match, game) : game.inputs;
  const result = live ? tidy(scoreGame(game.config, players, gameCourse(match), range, strokes, inputs), game.config.id, parThru(match, strokes)) : null;
  const thru = holesThru(strokes, holes);
  const names = game.players.map(firstName);
  return <article className={styles.section} aria-label={def.name}>
    <div className={styles.activeGameHead}>
      <div><h3>{def.name}</h3><p className={styles.summary}>Round {game.round} · {game.config.net ? "Net" : "Gross"}{game.config.birdiesDouble ? " · Birdies double" : ""}{live ? ` · Thru ${thru}` : ""}</p></div>
      <button type="button" className={styles.back} onClick={onRemove}>Remove</button>
    </div>
    {/* Team games list their sides in the standings, so the names aren't repeated up here. */}
    {!(live && def.teams) && <p className={styles.summary}>{game.config.teams && def.teams
      ? [0, 1].map((t) => game.players.filter((_, i) => game.config.teams![i] === t).map(firstName).join(" & ")).join("  vs  ")
      : names.join(" · ")}</p>}
    {!live ? <p className={styles.emptyGames}>Scores show here during Round {game.round}.</p> : <>
      {def.holeInput && def.holeInput !== "snake" && <div className={styles.holePick}>
        <div className={styles.holeStep}>
          <button type="button" aria-label="Previous hole" disabled={hole <= 0} onClick={() => setShown(Math.max(0, hole - 1))}><ChevronLeft size={18} aria-hidden /></button>
          <b>Hole {hole + 1}{hole === now && thru < holes ? " · now" : ""}</b>
          <button type="button" aria-label="Next hole" disabled={hole >= holes - 1} onClick={() => setShown(Math.min(holes - 1, hole + 1))}><ChevronRight size={18} aria-hidden /></button>
        </div>
        {def.holeInput === "wolf" ? <WolfPicks wolf={wolfFor(hole, range, names.length)} names={names} input={game.inputs[hole] ?? {}} onChange={(part) => onInput(hole, part)} />
          : def.holeInput === "daytona" ? <DaytonaPicks key={hole} names={names} input={game.inputs[hole] ?? {}} onChange={(part) => onInput(hole, part)} />
          : <HolePicks game={game.config} hole={hole} range={range} names={names} input={game.inputs[hole] ?? {}} onChange={(part) => onInput(hole, part)} />}
      </div>}
      {result && <Standings result={result} compact />}
    </>}
  </article>;
}

/** Before the round: the game's options, then Start (owner request 2026-10-17). */
function PreRound({ game, onChange, onStart, onRemove }: { game: TripGame; onChange: (config: GameConfig) => void; onStart: () => void; onRemove: () => void }) {
  const def = gameDef(game.config.id), config = game.config;
  const [info, setInfo] = useState(false);
  const teams = config.teams ?? game.players.map((_, i) => i < game.players.length / 2 ? 0 : 1);
  const teamsOk = !def.teams || (teams.includes(0) && teams.includes(1));
  const set = (part: Partial<GameConfig>) => onChange({ ...config, ...(def.teams ? { teams } : {}), ...part });
  return <article className={styles.section} aria-label={`${def.name} setup`}>
    <div className={styles.activeGameHead}>
      <div><h3>{def.name} <button type="button" className={styles.gameInfo} aria-label={`About ${def.name}`} aria-expanded={info} onClick={() => setInfo(!info)}>i</button></h3>
        <p className={styles.summary}>Round {game.round} · Before you tee off</p></div>
      <button type="button" className={styles.back} onClick={onRemove}>Remove</button>
    </div>
    {info && <InfoCard title={def.name} text={def.blurb} onClose={() => setInfo(false)} />}
    <div className={styles.preRound}>
      <div className={styles.sheetSetting}><span>Scoring</span><div className={styles.sheetChoices}>
        {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={config.net === value} onClick={() => set({ net: value })}>{value ? "Net (handicaps)" : "Gross"}</button>)}
      </div></div>
      {def.points && <div className={styles.sheetSetting}><span>Birdies double points</span><div className={styles.sheetChoices}>
        {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={config.birdiesDouble === value} onClick={() => set({ birdiesDouble: value })}>{value ? "On" : "Off"}</button>)}
      </div></div>}
      {def.teams && <div className={styles.sheetSetting}><span>Teams</span>
        {game.players.map((name, i) => <div key={name} className={styles.arrowRow}>
          <button type="button" aria-label={`${name} on the left team`} aria-pressed={teams[i] === 0} onClick={() => set({ teams: Object.assign([...teams], { [i]: 0 }) })}><ArrowLeft size={16} aria-hidden /></button>
          <span>{name}</span>
          <button type="button" aria-label={`${name} on the right team`} aria-pressed={teams[i] === 1} onClick={() => set({ teams: Object.assign([...teams], { [i]: 1 }) })}><ArrowRight size={16} aria-hidden /></button>
        </div>)}
        {!teamsOk && <p className={styles.sheetHint}>Put at least one player on each team.</p>}
      </div>}
      {def.holeInput === "wolf" && <p className={styles.summary}>Wolf order: {game.players.map(firstName).join(" → ")}, then it repeats.</p>}
      <button type="button" className={styles.sheetPrimary} disabled={!teamsOk} onClick={onStart}>Start game</button>
    </div>
  </article>;
}

/** New game: round → players from my group → a game that fits that many. Its options come next, on the game itself. */
function NewGame({ box, group, rounds, current, onClose, onCreate }: { box: { top: number; bottom: number }; group: string[]; rounds: number[]; current: number; onClose: () => void; onCreate: (game: TripGame) => void }) {
  const [round, setRound] = useState(rounds.includes(current) ? current : rounds[0]);
  const [players, setPlayers] = useState<string[]>(group);
  const [id, setId] = useState<GameId | null>(null);
  const [info, setInfo] = useState<GameId | null>(null);
  const [net, setNet] = useState(false);
  const [birdiesDouble, setBirdiesDouble] = useState(false);
  const choices = gamesFor(players.length);
  const toggle = (name: string) => { setId(null); setPlayers((list) => list.includes(name) ? list.filter((n) => n !== name) : group.filter((n) => list.includes(n) || n === name)); };
  const create = () => {
    if (!id) return;
    const def = gameDef(id);
    onCreate({ key: `${Date.now()}`, round, players, inputs: [], started: false,
      config: { id, net, birdiesDouble: def.points && birdiesDouble, ...(def.teams ? { teams: players.map((_, i) => i < players.length / 2 ? 0 : 1) } : {}) } });
  };
  return <GolfTripActionSheet label="New game" onClose={onClose} className={styles.gameSheet} style={box}>
    <div className={styles.sheetBody}>
      <h3 className={styles.sheetTitle}>New game</h3>
      <div className={styles.sheetSetting}><span>Round</span><div className={`${styles.sheetChoices} ${styles.roundChoices}`}>
        {rounds.map((r) => <button type="button" key={r} aria-pressed={round === r} onClick={() => setRound(r)}>Round {r}</button>)}
      </div></div>
      <div className={styles.sheetSetting}><span>Players · your group</span>
        {group.map((name, i) => <label key={name} className={styles.sheetPlayer}>
          <input type="checkbox" checked={players.includes(name)} disabled={i === 0} onChange={() => toggle(name)} />
          <span>{name}{i === 0 && <small>You</small>}</span>
        </label>)}
      </div>
      {/* Always on the sheet: handicaps, and birdies double (greyed out for a game that isn't a points game). */}
      <div className={styles.createOptions}>
        <div className={styles.sheetSetting}><span>Handicaps</span><div className={styles.sheetChoices}>
          {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={net === value} onClick={() => setNet(value)}>{value ? "On (net)" : "Off (gross)"}</button>)}
        </div></div>
        <div className={styles.sheetSetting}><span>Birdies double points{id && !gameDef(id).points ? " · not used in this game" : ""}</span><div className={styles.sheetChoices}>
          {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={birdiesDouble === value} disabled={Boolean(id && !gameDef(id).points)} onClick={() => setBirdiesDouble(value)}>{value ? "On" : "Off"}</button>)}
        </div></div>
      </div>
      <div className={styles.sheetSetting}><span>Game · {players.length} players</span>
        {choices.length === 0 && <p className={styles.sheetHint}>No games fit {players.length} player{players.length === 1 ? "" : "s"}. Add someone from your group.</p>}
        <div className={styles.gameGrid}>
          {choices.map((g) => <div key={g.id} className={styles.gameOption}>
            <button type="button" className={styles.sheetGame} aria-pressed={id === g.id} onClick={() => setId(g.id)}><strong>{g.name}</strong></button>
            <button type="button" className={styles.gameInfo} aria-label={`About ${g.name}`} aria-expanded={info === g.id} onClick={() => setInfo(info === g.id ? null : g.id)}>i</button>
          </div>)}
        </div>
      </div>
    </div>
    {info && <InfoCard title={gameDef(info).name} text={gameDef(info).blurb} onClose={() => setInfo(null)} />}
    <div className={styles.sheetFooter}>
      {id ? <button type="button" className={styles.createButton} onClick={create}>
        <span><b>Create {gameDef(id).name}</b><small>{players.length} players · Round {round}</small></span>
        <span className={styles.createArrow} aria-hidden><ChevronRight size={20} strokeWidth={2.5} /></span>
      </button> : <p className={styles.createPrompt} role="status">Pick a game above to continue</p>}
    </div>
  </GolfTripActionSheet>;
}

/** A game's description in a small light card over the screen; tap anywhere outside it to close. */
function InfoCard({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // On the page itself (not inside the scrolling sheet), so the grey covers the whole screen however far you scroll.
  return createPortal(<div className={styles.infoLayer} onClick={onClose} onWheel={(event) => event.preventDefault()} onTouchMove={(event) => event.preventDefault()}>
    <div className={styles.infoCard} role="dialog" aria-label={`About ${title}`} onClick={(event) => event.stopPropagation()}>
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  </div>, document.body);
}

/**
 * Small tidy-ups to Play's standings for the trip card: Match Play's extra line repeats the leader (dropped), and team
 * stroke totals (Best Ball and the team formats) show to par, like Stroke Play.
 */
function tidy(result: GameResult, id: GameId, parSoFar: number): GameResult {
  const repeats = (id === "match" || id === "nassau") && result.note && result.standings.some((s) => s.label && result.note!.startsWith(s.label));
  const teamTotal = id === "bestball" || id === "scramble" || id === "shamble" || id === "alternate" || id === "chapman";
  const toPar = (n: number) => n === parSoFar ? "E" : n > parSoFar ? `+${n - parSoFar}` : String(n - parSoFar);
  return { ...result, note: repeats ? undefined : result.note,
    standings: teamTotal ? result.standings.map((s) => /^\d+$/.test(s.value) ? { ...s, value: `${s.value} (${toPar(Number(s.value))})` } : s) : result.standings };
}

/** Wolf: the Wolf on top with Go Lone Wolf beside them; the others underneath to pick as partner. Same picks as Play. */
function WolfPicks({ wolf, names, input, onChange }: { wolf: number; names: string[]; input: HoleInput; onChange: (part: HoleInput) => void }) {
  const lone = input.wolfPartner === null;
  return <div className={styles.wolf}>
    <div className={styles.wolfTop}>
      <span><small>Wolf</small><b>{names[wolf]}</b></span>
      <button type="button" className={styles.loneWolf} aria-pressed={lone} onClick={() => onChange({ wolfPartner: lone ? undefined : null })}>{lone ? "Lone Wolf ✓" : "Go Lone Wolf"}</button>
    </div>
    <div className={styles.wolfPartners} role="group" aria-label="Partner">
      <small>{lone ? "Playing alone for double" : "Partner"}</small>
      {names.map((name, i) => i === wolf ? null : <button key={i} type="button" disabled={lone} aria-pressed={input.wolfPartner === i}
        onClick={() => onChange({ wolfPartner: input.wolfPartner === i ? undefined : i })}>{name}</button>)}
    </div>
  </div>;
}

type Spot = "left" | "middle" | "right";
/**
 * Daytona: each player picks ← (left pair), middle, or → (right pair). It counts once there are 2 left, 1 middle and
 * 2 right (the same tee positions Play records).
 */
function DaytonaPicks({ names, input, onChange }: { names: string[]; input: HoleInput; onChange: (part: HoleInput) => void }) {
  const saved = input.daytona;
  const [spots, setSpots] = useState<(Spot | null)[]>(() => names.map((_, i) => !saved ? null : saved.middle === i ? "middle" : saved.left.includes(i) ? "left" : saved.right.includes(i) ? "right" : null));
  const pick = (i: number, spot: Spot) => {
    const next = Object.assign([...spots], { [i]: spots[i] === spot ? null : spot });
    setSpots(next);
    const at = (s: Spot) => next.map((v, p) => v === s ? p : -1).filter((p) => p >= 0);
    const [left, middle, right] = [at("left"), at("middle"), at("right")];
    onChange({ daytona: left.length === 2 && middle.length === 1 && right.length === 2 ? { left: [left[0], left[1]], middle: middle[0], right: [right[0], right[1]] } : undefined });
  };
  const ready = Boolean(input.daytona);
  return <div className={styles.daytona}>
    {names.map((name, i) => <div key={i} className={`${styles.arrowRow} ${styles.spotRow}`}>
      <span>{name}</span>
      <button type="button" aria-label={`${name} left pair`} aria-pressed={spots[i] === "left"} onClick={() => pick(i, "left")}><ArrowLeft size={16} aria-hidden /></button>
      <button type="button" aria-label={`${name} in the middle`} aria-pressed={spots[i] === "middle"} onClick={() => pick(i, "middle")}><Dot size={22} aria-hidden /></button>
      <button type="button" aria-label={`${name} right pair`} aria-pressed={spots[i] === "right"} onClick={() => pick(i, "right")}><ArrowRight size={16} aria-hidden /></button>
    </div>)}
    {!ready && <small className={styles.daytonaHint}>Set 2 left, 1 middle and 2 right</small>}
  </div>;
}
