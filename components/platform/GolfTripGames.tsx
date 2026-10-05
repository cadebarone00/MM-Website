"use client";

import { useState } from "react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { GAME_PREVIEW_PLAYERS as players, GAME_PREVIEW_ROUNDS as rounds, GAME_PREVIEW_ROUNDS_PLAYED as roundsPlayed, SIDE_GAME_REGISTRY, type GameId, type SideGameDefinition } from "@/lib/platform/golfTripGames";
import { GolfGameScoringPreview } from "./GolfGameScoringPreview";
import styles from "./GolfTripGames.module.css";

type Length = "round" | "tournament";
type ActiveGame = { key: number; game: SideGameDefinition; length: Length; handicap: boolean; participants: string[] };

const INDIVIDUAL_GAME_IDS: GameId[] = ["skins"];
const LIBRARY = [
  { title: "Individual", games: SIDE_GAME_REGISTRY.filter(game => INDIVIDUAL_GAME_IDS.includes(game.id)) },
  { title: "Team", games: SIDE_GAME_REGISTRY.filter(game => !INDIVIDUAL_GAME_IDS.includes(game.id)) },
];
const nameOf = (id: string) => players.find(player => player.id === id)?.name ?? "Choose player";

// Length: defaults to the upcoming round. The other option covers every round still to play —
// "Whole tournament" before Round 1, "Rest of tournament" once rounds have been played.
const remainingRounds = rounds.slice(Math.min(roundsPlayed, rounds.length - 1));
const upcoming = remainingRounds[0];
const roundsFor = (length: Length) => length === "round" ? [upcoming] : remainingRounds;
const lengthLabel = (length: Length) => length === "round" ? `Round ${upcoming.number} · ${upcoming.course}`
  : roundsPlayed === 0 ? "Whole tournament" : `Rest of tournament · Rounds ${upcoming.number}–${rounds[rounds.length - 1].number}`;

/** How many players a game takes: Match Play follows its 1v1 / 2v2 setting, the rest use their group sizes. */
function playerRange(game: SideGameDefinition, matchFormat: 2 | 4): [number, number] {
  if (game.id === "match-play") return [matchFormat, matchFormat];
  const sizes = game.supportedGroupSizes.filter(size => size !== 1);
  return [Math.min(...sizes), Math.max(...sizes)];
}

function GameRules({ game, selected }: { game: SideGameDefinition; selected: string[] }) {
  if (game.id === "skins") return <><h4>Skins</h4><p>{selected.map(nameOf).join(" · ")}</p><p>Lowest score on a hole wins the skin. Tied holes carry the skin to the next hole.</p></>;
  if (game.id === "match-play") return <><h4>{selected.length === 4 ? "2v2 Best Ball Match Play" : "1v1 Match Play"}</h4><p>{selected.length === 4 ? `${nameOf(selected[0])} + ${nameOf(selected[1])} vs ${nameOf(selected[2])} + ${nameOf(selected[3])}` : `${nameOf(selected[0])} vs ${nameOf(selected[1])}`}</p><p>Each hole counts toward Up / Down. Final ties stay tied.</p></>;
  if (game.id === "9-point") return <><h4>9 points available per hole</h4><p>{selected.map(nameOf).join(" · ")}</p><p>Low / middle / high: 5 / 3 / 1. Ties: 4 / 4 / 1, 5 / 2 / 2 or 3 / 3 / 3.</p></>;
  if (game.id === "wolf") return <><h4>Wolf rotation</h4><ol>{selected.map((id, index) => <li key={id}>{nameOf(id)} · Wolf turn {index + 1}</li>)}</ol><p>Order repeats each round. Choose a partner or Lone Wolf each hole; a solo win earns 2 points.</p></>;
  if (game.id === "vegas") return <><h4>Team 1 vs Team 2</h4><div className={styles.teams}>{[0, 2].map((start, index) => <div key={start}><strong>Team {index + 1}</strong><p>{nameOf(selected[start])}<br />{nameOf(selected[start + 1])}</p><span>Example scores: 4 + 5 → <strong>45</strong></span></div>)}</div><p>Lower team number wins its difference in points.</p></>;
  if (game.id === "coin-flip") return <><h4>Partners by coin flip</h4><p>{selected.map(nameOf).join(" / ")}</p><p>Set Heads / Tails every hole. Winners earn one point per opponent; all-same flips earn no points.</p></>;
  return <><h4>Three six-hole matches</h4><p>1–6: 1 + 2 vs 3 + 4. 7–12: 1 + 3 vs 2 + 4. 13–18: 1 + 4 vs 2 + 3.</p><p>Best Ball Match Play. Winning partners each earn 1 segment point; tied segments earn 0.</p></>;
}

export function GolfTripGames() {
  const [open, setOpen] = useState(false);
  const [sheetBox, setSheetBox] = useState<{ top: number; bottom: number }>({ top: 16, bottom: 16 });
  const [game, setGame] = useState<SideGameDefinition | null>(null);
  const [length, setLength] = useState<Length>("round");
  const [matchFormat, setMatchFormat] = useState<2 | 4>(2);
  const [handicap, setHandicap] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [selected, setSelected] = useState<string[]>(["you"]);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [openGameKey, setOpenGameKey] = useState<number | null>(null);
  const [min, max] = game ? playerRange(game, matchFormat) : [2, 2];
  const valid = selected.length >= min && selected.length <= max;

  // Fixed popup size: top just covers the Home–Info tabs; bottom sits 5% of the screen above the bottom nav.
  const openPopup = () => {
    const tabs = document.querySelector("[aria-label='Trip sections']")?.getBoundingClientRect();
    const nav = document.querySelector("[data-site-bottom-nav]")?.getBoundingClientRect();
    const gap = window.innerHeight * 0.05;
    setSheetBox({ top: Math.max(16, tabs?.top ?? 16), bottom: (nav && nav.height > 0 ? window.innerHeight - nav.top : 0) + gap });
    setOpen(true);
  };
  const closePopup = () => { setOpen(false); setGame(null); };
  const chooseGame = (next: SideGameDefinition) => {
    setGame(next); setLength("round"); setMatchFormat(2); setHandicap(false); setShowPlayers(false); setSelected(["you"]);
  };
  const togglePlayer = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < max ? [...current, id] : current);
  const submitGame = () => {
    if (!game || !valid) return;
    setActiveGames(current => [...current, { key: Date.now(), game, length, handicap, participants: selected }]);
    closePopup();
  };

  return <section className={styles.root} aria-label="Side games preview">
    <header className={styles.gamesHeader}>
      <h2 className={styles.activeGamesTitle}>Active Games</h2>
      <button type="button" className={styles.newGameButton} aria-haspopup="dialog" onClick={openPopup}>New game</button>
    </header>

    {activeGames.length === 0 && <p className={styles.emptyGames}>No active games yet. Tap New game to start one.</p>}
    {activeGames.map(item => <article key={item.key} className={styles.section}>
      <div className={styles.activeGameHead}>
        <div><h3>{item.game.name}</h3><p className={styles.summary}>{lengthLabel(item.length)} · Handicap {item.handicap ? "On" : "Off"}</p></div>
        <button type="button" className={styles.back} aria-expanded={openGameKey === item.key} onClick={() => setOpenGameKey(key => key === item.key ? null : item.key)}>{openGameKey === item.key ? "Hide" : "Open"}</button>
      </div>
      <p>{item.participants.map(nameOf).join(" · ")}</p>
      {openGameKey === item.key && <>
        <div className={styles.configuration}><GameRules game={item.game} selected={item.participants} /></div>
        <GolfGameScoringPreview setup={{ id: item.game.id, scope: item.length, participants: item.participants, handicap: item.handicap, rounds: roundsFor(item.length).map(round => ({ id: round.id, holes: 18 })), tiePolicy: "tied", loneWolfMultiplier: 2 }} />
      </>}
    </article>)}

    {open && <GolfTripActionSheet label="New game" onClose={closePopup} className={styles.gameSheet} style={sheetBox}>
      {!game ? <div className={styles.sheetBody}>
        <h3 className={styles.sheetTitle}>New game</h3>
        {LIBRARY.map(group => <section key={group.title} className={styles.sheetGroup} aria-label={group.title}>
          <h4 className={styles.sheetGroupTitle}>{group.title}</h4>
          {group.games.map(item => <button type="button" key={item.id} className={styles.sheetGame} onClick={() => chooseGame(item)}>
            <strong>{item.name}</strong><span>{item.description}</span>
          </button>)}
        </section>)}
      </div> : <div className={styles.sheetBody}>
        <button type="button" className={styles.sheetBack} onClick={() => setGame(null)}>← All games</button>
        <h3 className={styles.sheetTitle}>{game.name}</h3>

        <div className={styles.sheetSetting}><span>Length</span><div className={styles.sheetChoices}>
          <button type="button" aria-pressed={length === "round"} onClick={() => setLength("round")}>{lengthLabel("round")}</button>
          {remainingRounds.length > 1 && <button type="button" aria-pressed={length === "tournament"} onClick={() => setLength("tournament")}>{lengthLabel("tournament")}</button>}
        </div></div>

        {game.id === "match-play" && <div className={styles.sheetSetting}><span>Format</span><div className={styles.sheetChoices}>
          {([2, 4] as const).map(value => <button type="button" key={value} aria-pressed={matchFormat === value} onClick={() => { setMatchFormat(value); setSelected(current => current.slice(0, value)); }}>{value === 2 ? "1v1" : "2v2 Best Ball"}</button>)}
        </div></div>}

        {game.supportsHandicap && <div className={styles.sheetSetting}><span>Handicap</span><div className={styles.sheetChoices}>
          {[false, true].map(value => <button type="button" key={String(value)} aria-pressed={handicap === value} onClick={() => setHandicap(value)}>{value ? "On" : "Off"}</button>)}
        </div></div>}

        {!showPlayers ? <button type="button" className={styles.sheetPrimary} onClick={() => setShowPlayers(true)}>Select players</button> : <>
          <div className={styles.sheetSetting}><span>Players · {selected.length}/{min === max ? max : `${min}–${max}`}</span>
            {players.map(player => <label key={player.id} className={styles.sheetPlayer}>
              <input type="checkbox" checked={selected.includes(player.id)} disabled={player.id === "you" || (!selected.includes(player.id) && selected.length >= max)} onChange={() => togglePlayer(player.id)} />
              <span>{player.name}<small>{player.group}</small></span>
            </label>)}
          </div>
          {!valid && <p role="status" className={styles.sheetHint}>Choose {min === max ? min : `${min} to ${max}`} players, including you.</p>}
          <button type="button" className={styles.sheetPrimary} disabled={!valid} onClick={submitGame}>Submit game</button>
        </>}
      </div>}
    </GolfTripActionSheet>}
  </section>;
}
