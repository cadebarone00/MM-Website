import { SIDE_GAME_REGISTRY, type GameId } from "../golfTripGames";
import { scoreMatchPlay, calculateMatch } from "./matchPlay";
import { scoreNinePoint } from "./ninePoint";
import { scoreWolf } from "./wolf";
import { scoreVegas } from "./vegas";
import { scoreSixes } from "./sixes";
import { scoreCoinFlip } from "./coinFlip";
import { fixedTeams, type GameSetup, type HoleInput, type HoleResult, type GameResult, type Scorer } from "./types";
export type { GameSetup, HoleInput, HoleResult, GameResult } from "./types";
export { wolfForHole } from "./wolf";
export { sixesPairing } from "./sixes";

export const GAME_ENGINES: Record<GameId, { participantCounts: number[]; scoreHole: Scorer }> = {
  "match-play": { participantCounts: [2, 4], scoreHole: scoreMatchPlay },
  "9-point": { participantCounts: [3], scoreHole: scoreNinePoint },
  wolf: { participantCounts: [3, 4, 5], scoreHole: scoreWolf },
  vegas: { participantCounts: [4], scoreHole: scoreVegas },
  "round-robin": { participantCounts: [4], scoreHole: scoreSixes },
  "coin-flip": { participantCounts: [4, 5], scoreHole: scoreCoinFlip },
};

export function validateSetup(setup: GameSetup): void {
  const engine = GAME_ENGINES[setup.id];
  const definition = SIDE_GAME_REGISTRY.find(game => game.id === setup.id);
  if (!engine || !definition?.supportedScopes.includes(setup.scope)) throw new Error("Unsupported game or scope.");
  if (!engine.participantCounts.includes(setup.participants.length) || new Set(setup.participants).size !== setup.participants.length || setup.participants.some(id => !id.trim() || ["team-1", "team-2"].includes(id))) throw new Error("Invalid participants.");
  if (!setup.rounds.length || (setup.scope === "round" && setup.rounds.length !== 1) || new Set(setup.rounds.map(round => round.id)).size !== setup.rounds.length || setup.rounds.some(round => !round.id || !Number.isInteger(round.holes) || round.holes < 1 || round.holes > 18 || (setup.id === "round-robin" && round.holes !== 18))) throw new Error("Invalid configured rounds; Sixes requires 18 holes.");
  if (setup.teams) {
    const flat = setup.teams.flat();
    if (!["match-play", "vegas"].includes(setup.id) || setup.teams.some(team => team.length !== setup.participants.length / 2) || new Set(flat).size !== setup.participants.length || flat.some(id => !setup.participants.includes(id))) throw new Error("Teams must partition the participants equally.");
  }
  if (setup.rotation && (setup.rotation.length !== setup.participants.length || new Set(setup.rotation).size !== setup.participants.length || setup.rotation.some(id => !setup.participants.includes(id)))) throw new Error("Rotation must contain each participant once.");
  if (setup.loneWolfMultiplier !== undefined && (!Number.isFinite(setup.loneWolfMultiplier) || setup.loneWolfMultiplier <= 0)) throw new Error("Lone Wolf multiplier must be positive.");
  if (setup.tiePolicy !== undefined && setup.tiePolicy !== "tied") throw new Error("Only tied final results are supported in v1.");
}

export function scoreHole(setup: GameSetup, input: HoleInput): HoleResult {
  validateSetup(setup);
  const round = setup.rounds.find(round => round.id === input.roundId);
  if (!round || !Number.isInteger(input.hole) || input.hole < 1 || input.hole > round.holes) throw new Error("Hole is outside the configured round.");
  const scores = Object.fromEntries(setup.participants.map(id => {
    const value = setup.handicap ? input.scores[id]?.net : input.scores[id]?.gross;
    if (value === undefined || !Number.isSafeInteger(value) || Math.abs(value) > 99 || (!setup.handicap && value < 1)) throw new Error(`Provide a valid ${setup.handicap ? "preview net" : "gross"} score for ${id} (gross 1–99; net -99–99).`);
    return [id, value];
  }));
  return GAME_ENGINES[setup.id].scoreHole(setup, input, scores);
}

/** Pure replay; input holes must be a contiguous prefix per round. No official score sources. */
export function calculateGame(setup: GameSetup, inputs: HoleInput[]): GameResult {
  validateSetup(setup);
  const scored = inputs.map(input => scoreHole(setup, input));
  const keys = scored.map(hole => `${hole.roundId}:${hole.hole}`);
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate hole results.");
  for (const round of setup.rounds) {
    const holes = scored.filter(hole => hole.roundId === round.id).sort((a, b) => a.hole - b.hole);
    if (holes.some((hole, index) => hole.hole !== index + 1)) throw new Error("Score holes in order without gaps.");
  }
  const teamGame = setup.id === "match-play" || setup.id === "vegas";
  const totals: Record<string, number> = Object.fromEntries((teamGame ? ["team-1", "team-2"] : setup.participants).map(id => [id, 0]));
  const matches: GameResult["matches"] = [];
  const holes: HoleResult[] = [];
  let complete = true;
  for (const round of setup.rounds) {
    const roundHoles = scored.filter(hole => hole.roundId === round.id).sort((a, b) => a.hole - b.hole);
    if (setup.id === "match-play") {
      const match = calculateMatch(roundHoles, round.holes);
      matches.push({ ...match.result, roundId: round.id });
      holes.push(...match.counted);
      complete &&= match.result.status === "complete";
      // Whole Tournament: one match point for a round win, half each for a tie.
      if (match.result.status === "complete") {
        if (match.result.winner === undefined) { totals["team-1"] += 0.5; totals["team-2"] += 0.5; }
        else totals[`team-${match.result.winner + 1}`] += 1;
      }
    } else if (setup.id === "round-robin") {
      holes.push(...roundHoles);
      for (let segment = 1; segment <= 3; segment++) {
        const segmentHoles = roundHoles.filter(hole => hole.segment === segment);
        const match = calculateMatch(segmentHoles, 6);
        matches.push({ ...match.result, roundId: round.id, segment });
        // Segment points are awarded at the end of its six holes, even if clinched early.
        if (segmentHoles.length === 6 && match.result.winner !== undefined) for (const id of segmentHoles[0].sides![match.result.winner]) totals[id] += 1;
      }
      complete &&= roundHoles.length === round.holes;
    } else {
      holes.push(...roundHoles);
      complete &&= roundHoles.length === round.holes;
      for (const hole of roundHoles) for (const [id, points] of Object.entries(hole.points)) totals[id] += points;
    }
  }
  const max = Math.max(...Object.values(totals));
  let leaders = Object.keys(totals).filter(id => totals[id] === max);
  let label = leaders.length > 1 ? complete ? "Tied" : "Tied leaders" : `${leaders[0]} ${complete ? "wins" : "leads"}`;
  if (setup.id === "match-play" && setup.scope === "round") {
    const match = matches[0];
    label = match.state;
    leaders = match.lead === 0 ? ["team-1", "team-2"] : [match.lead > 0 ? "team-1" : "team-2"];
  }
  return { status: complete ? "complete" : holes.length ? "in-progress" : "ready", totals, leaders, label, holes, matches };
}

/** Local fixture helper, deliberately separate from real handicap allocation. */
export function previewScores(participants: string[], hole: number): HoleInput["scores"] {
  return Object.fromEntries(participants.map((id, index) => {
    const gross = 3 + ((hole + index) % 4);
    return [id, { gross, net: gross - (index % 2) }];
  }));
}
export function setupTeams(setup: GameSetup) { return fixedTeams(setup); }
