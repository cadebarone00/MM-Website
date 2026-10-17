"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import homeStyles from "./GolfTripHome.module.css";
import { useEffect, useState } from "react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { HolePicks, Standings } from "./PlayRound";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { gameDef, gamesFor, scoreGame, type GameConfig, type GameId, type HoleInput } from "@/lib/platform/roundGames";
import { currentHole, gameCourse, gamePlayers, gameStrokes, groupOf, holesThru, meOn, type TripGame } from "@/lib/platform/tripGames";
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
  useEffect(() => { setGames(readGames()); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- reads this device's saved games once
  const save = (next: TripGame[]) => { setGames(next); try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private mode */ } };
  const [creating, setCreating] = useState(false);
  // The sheet's box: top just covers the trip tabs; bottom sits above the site's bottom nav (so Create is never hidden).
  const [sheetBox, setSheetBox] = useState({ top: 16, bottom: 16 });
  const openNew = () => {
    const tabs = document.querySelector("[aria-label='Trip sections']")?.getBoundingClientRect();
    const nav = document.querySelector("[data-site-bottom-nav]")?.getBoundingClientRect();
    setSheetBox({ top: Math.max(16, tabs?.top ?? 16), bottom: (nav && nav.height > 0 ? window.innerHeight - nav.top : 0) + window.innerHeight * 0.03 });
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
  const result = live ? scoreGame(game.config, players, gameCourse(match), range, strokes, game.inputs) : null;
  const thru = holesThru(strokes, holes);
  return <article className={styles.section} aria-label={def.name}>
    <div className={styles.activeGameHead}>
      <div><h3>{def.name}</h3><p className={styles.summary}>Round {game.round} · {game.config.net ? "Net" : "Gross"}{game.config.birdiesDouble ? " · Birdies double" : ""}{live ? ` · Thru ${thru}` : ""}</p></div>
      <button type="button" className={styles.back} onClick={onRemove}>Remove</button>
    </div>
    <p className={styles.summary}>{game.config.teams && def.teams
      ? [0, 1].map((t) => game.players.filter((_, i) => game.config.teams![i] === t).map(firstName).join(" & ")).join("  vs  ")
      : game.players.map(firstName).join(" · ")}</p>
    {!live ? <p className={styles.emptyGames}>Scores show here during Round {game.round}.</p> : <>
      {def.holeInput && <div className={styles.holePick}>
        <div className={styles.holeStep}>
          <button type="button" aria-label="Previous hole" disabled={hole <= 0} onClick={() => setShown(Math.max(0, hole - 1))}><ChevronLeft size={18} aria-hidden /></button>
          <b>Hole {hole + 1}{hole === now && thru < holes ? " · now" : ""}</b>
          <button type="button" aria-label="Next hole" disabled={hole >= holes - 1} onClick={() => setShown(Math.min(holes - 1, hole + 1))}><ChevronRight size={18} aria-hidden /></button>
        </div>
        <HolePicks game={game.config} hole={hole} range={range} names={game.players.map(firstName)} input={game.inputs[hole] ?? {}} onChange={(part) => onInput(hole, part)} />
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
    {info && <p className={styles.gameBlurbDark}>{def.blurb}</p>}
    <div className={styles.preRound}>
      <div className={styles.sheetSetting}><span>Scoring</span><div className={styles.sheetChoices}>
        {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={config.net === value} onClick={() => set({ net: value })}>{value ? "Net (handicaps)" : "Gross"}</button>)}
      </div></div>
      {def.points && <div className={styles.sheetSetting}><span>Birdies double points</span><div className={styles.sheetChoices}>
        {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={config.birdiesDouble === value} onClick={() => set({ birdiesDouble: value })}>{value ? "On" : "Off"}</button>)}
      </div></div>}
      {def.teams && <div className={styles.sheetSetting}><span>Teams</span>
        {game.players.map((name, i) => <div key={name} className={styles.teamRow}><span>{name}</span><div className={styles.sheetChoices}>
          {[0, 1].map((t) => <button type="button" key={t} aria-pressed={teams[i] === t} onClick={() => set({ teams: Object.assign([...teams], { [i]: t }) })}>Team {t + 1}</button>)}
        </div></div>)}
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
  const choices = gamesFor(players.length);
  const toggle = (name: string) => { setId(null); setPlayers((list) => list.includes(name) ? list.filter((n) => n !== name) : group.filter((n) => list.includes(n) || n === name)); };
  const create = () => {
    if (!id) return;
    const def = gameDef(id);
    onCreate({ key: `${Date.now()}`, round, players, inputs: [], started: false,
      config: { id, net: false, birdiesDouble: false, ...(def.teams ? { teams: players.map((_, i) => i < players.length / 2 ? 0 : 1) } : {}) } });
  };
  return <GolfTripActionSheet label="New game" onClose={onClose} className={styles.gameSheet} style={box}>
    <div className={styles.sheetBody}>
      <h3 className={styles.sheetTitle}>New game</h3>
      <div className={styles.sheetSetting}><span>Round</span><div className={styles.sheetChoices}>
        {rounds.map((r) => <button type="button" key={r} aria-pressed={round === r} onClick={() => setRound(r)}>Round {r}</button>)}
      </div></div>
      <div className={styles.sheetSetting}><span>Players · your group</span>
        {group.map((name, i) => <label key={name} className={styles.sheetPlayer}>
          <input type="checkbox" checked={players.includes(name)} disabled={i === 0} onChange={() => toggle(name)} />
          <span>{name}{i === 0 && <small>You</small>}</span>
        </label>)}
      </div>
      <div className={styles.sheetSetting}><span>Game · {players.length} players</span>
        {choices.length === 0 && <p className={styles.sheetHint}>No games fit {players.length} player{players.length === 1 ? "" : "s"}. Add someone from your group.</p>}
        <div className={styles.gameGrid}>
          {choices.map((g) => <div key={g.id} className={styles.gameOption}>
            <button type="button" className={styles.sheetGame} aria-pressed={id === g.id} onClick={() => setId(g.id)}><strong>{g.name}</strong></button>
            <button type="button" className={styles.gameInfo} aria-label={`About ${g.name}`} aria-expanded={info === g.id} onClick={() => setInfo(info === g.id ? null : g.id)}>i</button>
            {info === g.id && <p className={styles.gameBlurb}>{g.blurb}</p>}
          </div>)}
        </div>
      </div>
    </div>
    <div className={styles.sheetFooter}>
      <button type="button" className={styles.sheetPrimary} disabled={!id} onClick={create}>{id ? `Create ${gameDef(id).name}` : "Pick a game"}</button>
    </div>
  </GolfTripActionSheet>;
}
