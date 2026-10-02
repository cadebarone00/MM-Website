"use client";

import { useState } from "react";
import { GAME_PREVIEW_PLAYERS as players, GAME_PREVIEW_ROUNDS as rounds, recommendedGames, type GameScope, type GroupSize, type SideGameDefinition } from "@/lib/platform/golfTripGames";
import styles from "./GolfTripGames.module.css";

const sizes: GroupSize[] = [1, 2, 3, 4, 5];
const sizeLabel = (size: number) => size === 1 ? "Single" : `${size}some`;
const nameOf = (id: string) => players.find(player => player.id === id)?.name ?? "Choose player";

export function GolfTripGames() {
  const [scope, setScope] = useState<GameScope | null>(null);
  const [size, setSize] = useState<GroupSize | null>(null);
  const [roundId, setRoundId] = useState<string>(rounds[0].id);
  const [game, setGame] = useState<SideGameDefinition | null>(null);
  const [selected, setSelected] = useState<string[]>(["you"]);
  const [handicap, setHandicap] = useState(false);
  const [pool, setPool] = useState("All players");
  const [coinMethod, setCoinMethod] = useState("Every hole");
  const [confirmed, setConfirmed] = useState(false);
  const count = size === 1 ? 2 : size ?? 2;
  const round = rounds.find(item => item.id === roundId)!;
  const valid = selected.length === count && (size !== 1 || selected.some(id => players.find(player => player.id === id)?.group === "Another group"));
  const resetGame = () => { setGame(null); setConfirmed(false); };
  const chooseGame = (next: SideGameDefinition) => {
    setGame(next); setConfirmed(false); setHandicap(false); setPool("All players");
    setSelected(size === 1 ? ["you", "riley"] : players.slice(0, count).map(player => player.id));
  };
  const togglePlayer = (id: string) => {
    setConfirmed(false);
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < count ? [...current, id] : current);
  };

  return <section className={styles.root} aria-label="Side games preview">
    <header><span className={styles.eyebrow}>A little friendly rivalry</span><h2>Make the trip your game</h2>
      <p>Optional side games, created by players. Pick your people and play your way.</p></header>
    <p className={styles.notice}>Local preview · Fictional players and rounds · Resets on reload. Official Competition standings and settings stay separate.</p>
    <ol className={styles.progress} aria-label="Game setup progress">
      {["Scope", "Group size", "Game", "Setup"].map((label, index) => <li key={label} aria-current={index === (game ? 3 : size ? 2 : scope ? 1 : 0) ? "step" : undefined}>{index + 1}. {label}</li>)}
    </ol>
    <fieldset className={styles.section}><legend>1. Where are you playing?</legend>
      <div className={styles.choices}>{([["tournament", "Whole Tournament"], ["round", "Per Round"]] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={scope === value} onClick={() => { setScope(value); resetGame(); }}>{label}</button>)}</div>
      {scope === "tournament" && <p>Spans the full event. No specific round needed.</p>}
      {scope === "round" && <label className={styles.label}>Choose one round<select value={roundId} onChange={event => { setRoundId(event.target.value); setConfirmed(false); }}>
        {rounds.map(item => <option key={item.id} value={item.id}>Round {item.number} · {item.course} · {item.date}</option>)}
      </select></label>}
    </fieldset>
    {scope && <fieldset className={styles.section}><legend>2. How big is your group?</legend><div className={`${styles.choices} ${styles.sizes}`}>
      {sizes.map(value => <button type="button" key={value} aria-pressed={size === value} onClick={() => { setSize(value); resetGame(); }}>{sizeLabel(value)}</button>)}
    </div>{size === 1 && <p>Going solo? Challenge a player in another group to Match Play.</p>}</fieldset>}
    {scope && size && !game && <section className={styles.section} aria-label="Recommended Games"><h3>3. Recommended Games</h3><p>Good company. A little competition. These fit your {sizeLabel(size).toLowerCase()}.</p>
      <div className={styles.library}>{recommendedGames(size, scope).map(item => <article key={item.id} className={styles.gameCard}>
        <span className={styles.eyebrow}>{item.gameType === "teams" ? "Team up" : item.gameType === "rotating" ? "Mix it up" : "Head to head"}</span>
        <h4>{item.name}</h4><p>{item.description}</p>
        <small>{item.supportedGroupSizes.filter(value => value !== 1).join(" / ")} players{item.id === "match-play" && " · Single: outside-group challenge"}</small>
        <button type="button" className={styles.primary} onClick={() => chooseGame(item)}>Select {item.name}</button>
      </article>)}</div></section>}
    {game && scope && size && <section className={styles.section} aria-label="Game setup preview">
      <button type="button" className={styles.back} onClick={resetGame}>← Change game</button><h3>4. {game.name} setup</h3>
      <p className={styles.summary}>{scope === "tournament" ? "Whole Tournament · Full event" : `Round ${round.number} · ${round.course} · ${round.date}`} · {sizeLabel(size)}</p>
      <fieldset className={styles.players}><legend>Choose players · {selected.length}/{count}</legend>
        <div className={styles.choices}>{["All players", "Your group", "Another group"].map(value => <button type="button" key={value} aria-pressed={pool === value} onClick={() => setPool(value)}>{value}</button>)}</div>
        <p>Selection order sets the preview order. Deselect a player to replace them.</p>
        {players.filter(player => pool === "All players" || player.group === pool).map(player => <label key={player.id} className={styles.player}>
          <input type="checkbox" checked={selected.includes(player.id)} disabled={player.id === "you" || (!selected.includes(player.id) && selected.length >= count) || (size === 1 && player.group !== "Another group")} onChange={() => togglePlayer(player.id)} />
          <span>{player.name}<small>{player.group}</small></span>
        </label>)}
      </fieldset>
      <div className={styles.configuration}>
        {game.id === "match-play" && <><h4>Player vs player</h4><p>{nameOf(selected[0])} vs {nameOf(selected[1])}</p>{size === 4 && <p>{nameOf(selected[2])} vs {nameOf(selected[3])}</p>}</>}
        {game.id === "9-point" && <><h4>9 points available per hole</h4><p>{selected.map(nameOf).join(" · ")}</p><p>Point allocation and ties will be configured later.</p></>}
        {game.id === "wolf" && <><h4>Wolf rotation preview</h4><ol>{selected.map((id, index) => <li key={id}>{nameOf(id)} · Wolf turn {index + 1}</li>)}</ol><p>Order repeats. Lone Wolf and scoring settings are coming later.</p></>}
        {game.id === "vegas" && <><h4>Team 1 vs Team 2</h4><div className={styles.teams}>{[0, 2].map((start, index) => <div key={start}><strong>Team {index + 1}</strong><p>{nameOf(selected[start])}<br />{nameOf(selected[start + 1])}</p><span>Example scores: 4 + 5 → <strong>45</strong></span></div>)}</div><p>Illustration only; no scores are calculated.</p></>}
        {game.id === "coin-flip" && <><h4>Partners by coin flip</h4><p>{selected.map(nameOf).join(" · ")}</p><label className={styles.label}>Flip timing (placeholder)<select value={coinMethod} onChange={event => { setCoinMethod(event.target.value); setConfirmed(false); }}><option>Every hole</option><option>Every 3 holes</option><option>Start of round</option></select></label><p>{size === 5 ? "Odd-player assignment needs future rules. " : ""}Partners are not randomized in this preview.</p></>}
        {game.id === "round-robin" && <><h4>Partners / opponents rotate</h4><p>{selected.map(nameOf).join(" → ")}</p><p>Preview: each segment brings a different matchup. Final pairings and rotation rules are coming later.</p></>}
      </div>
      {game.supportsHandicap && <fieldset className={styles.players}><legend>Side-game handicap</legend><div className={styles.choices}>{[false, true].map(value => <button type="button" key={String(value)} aria-pressed={handicap === value} onClick={() => { setHandicap(value); setConfirmed(false); }}>Handicap {value ? "On" : "Off"}</button>)}</div><p>Preview preference only. Official Competition handicap settings are unchanged.</p></fieldset>}
      <button type="button" className={styles.primary} disabled={!valid} onClick={() => setConfirmed(true)}>Create preview</button>
      {!valid && <p role="status">Choose exactly {count} players{size === 1 ? ", including an opponent from another group" : ""}.</p>}
      {confirmed && <p role="status" className={styles.confirmation}>{game.name} preview ready for {selected.map(nameOf).join(", ")}. Handicap {handicap ? "On" : "Off"}. Nothing saved, sent or scored.</p>}
    </section>}
  </section>;
}
