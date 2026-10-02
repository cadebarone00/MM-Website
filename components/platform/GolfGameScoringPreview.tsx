"use client";

import { useState } from "react";
import { calculateGame, previewScores, scoreHole, sixesPairing, wolfForHole, setupTeams, type GameSetup, type HoleInput } from "@/lib/platform/game-engine";
import { GAME_PREVIEW_PLAYERS, GAME_PREVIEW_ROUNDS } from "@/lib/platform/golfTripGames";
import styles from "./GolfTripGames.module.css";

const name = (id: string) => id === "team-1" ? "Team 1" : id === "team-2" ? "Team 2" : GAME_PREVIEW_PLAYERS.find(player => player.id === id)?.name ?? id;
export function GolfGameScoringPreview({ setup }: { setup: GameSetup }) {
  const [inputs, setInputs] = useState<HoleInput[]>([]);
  const [scores, setScores] = useState<Record<string, { gross: string; net: string }>>(() => Object.fromEntries(setup.participants.map(id => [id, { gross: "", net: "" }])));
  const [partner, setPartner] = useState("lone");
  const [flips, setFlips] = useState<Record<string, "heads" | "tails">>(() => Object.fromEntries(setup.participants.map((id, index) => [id, index % 2 ? "tails" : "heads"])));
  const [error, setError] = useState("");
  const result = calculateGame(setup, inputs);
  const round = setup.rounds.find(item => {
    if (setup.id === "match-play") return result.matches.find(match => match.roundId === item.id)?.status !== "complete";
    return inputs.filter(input => input.roundId === item.id).length < item.holes;
  });
  const hole = round ? inputs.filter(input => input.roundId === round.id).length + 1 : 1;
  const wolf = wolfForHole(setup, hole);
  const sides = setup.id === "round-robin" ? sixesPairing(setup, hole) : ["match-play", "vegas"].includes(setup.id) ? setupTeams(setup) : undefined;
  const input: HoleInput = {
    roundId: round?.id ?? setup.rounds[0].id, hole,
    scores: Object.fromEntries(setup.participants.map(id => [id, { gross: scores[id].gross === "" ? NaN : Number(scores[id].gross), net: scores[id].net === "" ? undefined : Number(scores[id].net) }])),
    wolfChoice: partner === "lone" ? { kind: "lone" } : { kind: "partner", partner }, flips,
  };
  let draft: ReturnType<typeof scoreHole> | undefined;
  try { if (round) draft = scoreHole(setup, input); } catch { /* Empty/invalid drafts are not committed. */ }
  const displayed = draft ?? result.holes.at(-1);
  const simulate = () => {
    setScores(Object.fromEntries(Object.entries(previewScores(setup.participants, hole)).map(([id, score]) => [id, { gross: String(score.gross), net: String(score.net) }])));
    setError("");
  };
  const save = () => {
    try {
      scoreHole(setup, input);
      setInputs([...inputs, input]);
      setScores(Object.fromEntries(setup.participants.map(id => [id, { gross: "", net: "" }])));
      setPartner("lone"); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to score hole."); }
  };
  return <section className={styles.configuration} aria-label="DEV scoring preview">
    <h4>DEV scoring preview</h4><p>Local scores only. Handicap {setup.handicap ? "On: enter provided preview net scores" : "Off: gross scores"}. Reload resets play.</p>
    {round && <><p><strong>{GAME_PREVIEW_ROUNDS.find(item => item.id === round.id)?.course ?? round.id} · Hole {hole}/{round.holes}</strong></p>
      {sides && <p>{setup.id === "round-robin" ? `Six-hole segment ${Math.ceil(hole / 6)}: ` : ""}Team 1: {sides[0].map(name).join(" + ")} vs Team 2: {sides[1].map(name).join(" + ")}</p>}
      {setup.id === "wolf" && <label className={styles.label}>Wolf: {name(wolf)}<select value={partner} onChange={event => setPartner(event.target.value)}><option value="lone">Lone Wolf</option>{setup.participants.filter(id => id !== wolf).map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>}
      {setup.participants.map(id => <div key={id} className={styles.scoreRow}><strong>{name(id)}</strong>
        <label className={styles.label}>{setup.handicap ? "Preview net" : "Gross"}<input type="number" min={setup.handicap ? -99 : 1} max={99} step={1} value={scores[id][setup.handicap ? "net" : "gross"]} onChange={event => { const field = setup.handicap ? "net" : "gross"; setScores(current => ({ ...current, [id]: { ...current[id], [field]: event.target.value } })); }} /></label>
        {setup.id === "coin-flip" && <label className={styles.label}>Flip<select value={flips[id]} onChange={event => setFlips(current => ({ ...current, [id]: event.target.value as "heads" | "tails" }))}><option value="heads">Heads</option><option value="tails">Tails</option></select></label>}
      </div>)}
      <div className={styles.choices}><button type="button" onClick={simulate}>Simulate hole scores</button><button type="button" onClick={save}>Record hole</button></div>
    </>}
    {error && <p role="alert">{error}</p>}
    {displayed && <div aria-live="polite"><strong>{draft ? "Current hole preview" : "Last recorded hole"}: {displayed.hole}</strong>
      <p>{displayed.status === "no-split" ? "No team split — no points" : displayed.status === "halved" ? "Halved — no points" : displayed.winner !== undefined ? `${setup.id === "coin-flip" ? displayed.winner === 0 ? "Heads" : "Tails" : `Team ${displayed.winner + 1}`} wins hole` : "9 Point allocation"}</p>
      {displayed.sideScores && <p>{setup.id === "vegas" ? "Vegas team numbers" : "Best scores"}: {displayed.sideScores.join(" vs ")}</p>}
      <p>Hole points: {Object.entries(displayed.points).filter(([, points]) => points !== 0).map(([id, points]) => `${name(id)} +${points}`).join(" · ") || (setup.id === "match-play" || setup.id === "round-robin" ? "0 (match holes count toward Up / Down)" : "0")}</p>
    </div>}
    <div role="status"><strong>{result.status === "complete" ? "Final result" : "Running result"}: {result.label.replace(/team-1/g, "Team 1").replace(/team-2/g, "Team 2").replace(/\b(you|sam|jordan|casey|riley|avery|taylor|jamie)\b/g, id => name(id))}</strong>
      <p>Leaders: {result.leaders.map(name).join(" · ")}</p>
      <p>{setup.id === "match-play" ? "Round match points" : "Totals"}: {Object.entries(result.totals).map(([id, points]) => `${name(id)}: ${points}`).join(" · ")}</p>
      {result.matches.map(match => <p key={`${match.roundId}-${match.segment}`}>{match.roundId}{match.segment ? ` · Segment ${match.segment}` : ""}: {match.state} · {match.holesRemaining} holes remaining</p>)}
    </div>
    {inputs.length > 0 && <button type="button" className={styles.back} onClick={() => { setInputs(inputs.slice(0, -1)); setPartner("lone"); setError(""); }}>Undo last hole</button>}
  </section>;
}
