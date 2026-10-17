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
 * in your group. Pick the round, the players and the game; during the round each game shows the hole's pick (Wolf
 * partner, Daytona spots, …) and the standings, scored from the scorecard. Preview: games are kept on this device.
 */
const STORE = "golfTripRoundGames";
const readGames = (): TripGame[] => { try { return JSON.parse(localStorage.getItem(STORE) ?? "[]"); } catch { return []; } };
const firstName = (name: string) => name.split(/\s+/)[0];

export function GolfTripGames({ match, rounds }: { match: GolfMatchPreview; rounds: number[] }) {
  const me = meOn(match) ?? "You";
  const group = groupOf(match, me);
  const [games, setGames] = useState<TripGame[]>([]);
  useEffect(() => { setGames(readGames()); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- reads this device's saved games once
  const save = (next: TripGame[]) => { setGames(next); try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private mode */ } };
  const [creating, setCreating] = useState(false);
  const mine = games.filter((g) => g.players.includes(me));

  return <section className={styles.root} aria-label="Games">
    <header className={styles.gamesHeader}>
      <h2 className={styles.activeGamesTitle}>Your games</h2>
      <button type="button" className={homeStyles.itineraryAddPill} aria-haspopup="dialog" onClick={() => setCreating(true)}><Plus size={16} strokeWidth={2.5} aria-hidden />New game</button>
    </header>
    <p className={styles.summary}>Games are with your group: {group.map(firstName).join(", ")}.</p>
    {mine.length === 0 && <p className={styles.emptyGames}>No games yet. Tap New game, pick a round and a game, and it scores itself from the scorecard.</p>}
    {mine.map((game) => <GameCard key={game.key} game={game} match={match}
      onInput={(hole, part) => save(games.map((g) => g.key !== game.key ? g : { ...g, inputs: Object.assign([...g.inputs], { [hole]: { ...g.inputs[hole], ...part } }) }))}
      onRemove={() => save(games.filter((g) => g.key !== game.key))} />)}
    {creating && <NewGame group={group} rounds={rounds.length ? rounds : [match.round]} current={match.round} onClose={() => setCreating(false)}
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

/** New game: round → players from my group → a game that fits that many → its options. */
function NewGame({ group, rounds, current, onClose, onCreate }: { group: string[]; rounds: number[]; current: number; onClose: () => void; onCreate: (game: TripGame) => void }) {
  const [round, setRound] = useState(rounds.includes(current) ? current : rounds[0]);
  const [players, setPlayers] = useState<string[]>(group);
  const [id, setId] = useState<GameId | null>(null);
  const [net, setNet] = useState(false);
  const [birdiesDouble, setBirdiesDouble] = useState(false);
  const [teams, setTeams] = useState<number[]>([]);
  const choices = gamesFor(players.length);
  const def = id ? gameDef(id) : null;
  const teamsOk = !def?.teams || (teams.includes(0) && teams.includes(1));
  const toggle = (name: string) => { setId(null); setPlayers((list) => list.includes(name) ? list.filter((n) => n !== name) : group.filter((n) => list.includes(n) || n === name)); };
  const pick = (next: GameId) => { setId(next); setBirdiesDouble(false); setTeams(players.map((_, i) => i < players.length / 2 ? 0 : 1)); };
  const create = () => {
    if (!def || !teamsOk) return;
    const config: GameConfig = { id: def.id, net, birdiesDouble: def.points && birdiesDouble, ...(def.teams ? { teams } : {}) };
    onCreate({ key: `${Date.now()}`, round, config, players, inputs: [] });
  };
  return <GolfTripActionSheet label="New game" onClose={onClose} className={styles.gameSheet} style={{ top: 16, bottom: 16 }}>
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
        {choices.map((g) => <button type="button" key={g.id} className={styles.sheetGame} aria-pressed={id === g.id} onClick={() => pick(g.id)}>
          <strong>{g.name}</strong><span>{g.blurb}</span>
        </button>)}
      </div>
      {def && <>
        <div className={styles.sheetSetting}><span>Scoring</span><div className={styles.sheetChoices}>
          {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={net === value} onClick={() => setNet(value)}>{value ? "Net (handicaps)" : "Gross"}</button>)}
        </div></div>
        {def.points && <div className={styles.sheetSetting}><span>Birdies double points</span><div className={styles.sheetChoices}>
          {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={birdiesDouble === value} onClick={() => setBirdiesDouble(value)}>{value ? "On" : "Off"}</button>)}
        </div></div>}
        {def.teams && <div className={styles.sheetSetting}><span>Teams</span>
          {players.map((name, i) => <div key={name} className={styles.teamRow}><span>{name}</span><div className={styles.sheetChoices}>
            {[0, 1].map((t) => <button type="button" key={t} aria-pressed={teams[i] === t} onClick={() => setTeams((list) => Object.assign([...list], { [i]: t }))}>Team {t + 1}</button>)}
          </div></div>)}
          {!teamsOk && <p className={styles.sheetHint}>Put at least one player on each team.</p>}
        </div>}
        <button type="button" className={styles.sheetPrimary} disabled={!teamsOk} onClick={create}>Start {def.name}</button>
      </>}
    </div>
  </GolfTripActionSheet>;
}
