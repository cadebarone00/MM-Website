import { readScore, type LiveMatchBox, type LiveTournamentSnapshot, type MatchState, type Session, type Team } from "./types.ts";

const MATCH_BOXES_PER_SESSION = 3;
const SESSION_PLAYER_COUNT = 12;

export function roundForSession(day: number, session: Session): number {
  return (day - 1) * 2 + (session === "Morning" ? 1 : 2);
}

export function matchBoxRound(matchBox: LiveMatchBox): number {
  return roundForSession(matchBox.day, matchBox.session);
}

export function validateMatchBox(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): string[] {
  const errors: string[] = [];
  if (matchBox.day < 1 || matchBox.day > 4) errors.push("Day must be between 1 and 4.");
  if (matchBox.boxNumber < 1 || matchBox.boxNumber > MATCH_BOXES_PER_SESSION) errors.push("Match box must be 1, 2, or 3.");
  if (matchBox.maroonPlayers.length !== 2) errors.push("Pick exactly two Maroon players.");
  if (matchBox.whitePlayers.length !== 2) errors.push("Pick exactly two White players.");

  for (const player of matchBox.maroonPlayers) {
    if (snapshot.players[player]?.team !== "maroon") errors.push(`${player} is not on Team Maroon.`);
  }
  for (const player of matchBox.whitePlayers) {
    if (snapshot.players[player]?.team !== "white") errors.push(`${player} is not on Team White.`);
  }

  const sessionBoxes = snapshot.matchBoxes.filter(
    (box) => box.day === matchBox.day && box.session === matchBox.session && box.boxNumber !== matchBox.boxNumber
  );
  const used = new Set(sessionBoxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]));
  const duplicates = [...matchBox.maroonPlayers, ...matchBox.whitePlayers].filter((player) => used.has(player));
  if (duplicates.length > 0) errors.push(`Players already assigned in this session: ${[...new Set(duplicates)].sort().join(", ")}.`);

  return errors;
}

export function sessionIsComplete(snapshot: LiveTournamentSnapshot, day: number, session: Session): boolean {
  const boxes = snapshot.matchBoxes.filter((box) => box.day === day && box.session === session);
  if (boxes.length !== MATCH_BOXES_PER_SESSION) return false;
  const players = boxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]);
  return players.length === SESSION_PLAYER_COUNT && new Set(players).size === SESSION_PLAYER_COUNT;
}

export function effectiveMatchState(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, now?: Date): MatchState {
  if (matchBox.state === "Final") return "Final";
  if (matchBoxStartedThru(snapshot, matchBox) === 18) return "Final";
  if (!matchBox.started) return "Scheduled";

  const current = now ?? new Date();
  return current >= matchBox.teeTime ? "Live" : "Armed";
}

export function matchBoxStartedThru(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): number {
  let completed = 0;
  for (let hole = 1; hole <= 18; hole++) {
    if (!holeComplete(snapshot, matchBox, hole)) break;
    completed = hole;
  }
  return completed;
}

export function thruLabel(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): string {
  const thru = matchBoxStartedThru(snapshot, matchBox);
  if (thru === 0) return "Thru";
  if (thru >= 18) return "Final";
  return `Thru ${thru}`;
}

export function holeComplete(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, hole: number): boolean {
  if (matchBox.format === "Alternate Shot") return false;
  const round = matchBoxRound(matchBox);
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];
  return players.every((player) => {
    const score = readScore(snapshot, player, round, hole);
    return score.score !== null && score.score > 0;
  });
}

export interface MatchBoxResult {
  maroonPts: number;
  whitePts: number;
  leader: Team | "tie";
  margin: number;
  holesRemaining: number;
}

export function matchBoxResult(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): MatchBoxResult {
  if (matchBox.format === "Alternate Shot") {
    return { maroonPts: 0, whitePts: 0, leader: "tie", margin: 0, holesRemaining: 18 };
  }

  const round = matchBoxRound(matchBox);
  let maroonHoles = 0;
  let whiteHoles = 0;
  let completed = 0;

  for (let hole = 1; hole <= 18; hole++) {
    if (!holeComplete(snapshot, matchBox, hole)) break;
    completed = hole;
    const maroonBest = Math.min(...matchBox.maroonPlayers.map((player) => readScore(snapshot, player, round, hole).score ?? 0));
    const whiteBest = Math.min(...matchBox.whitePlayers.map((player) => readScore(snapshot, player, round, hole).score ?? 0));
    if (maroonBest < whiteBest) maroonHoles++;
    else if (whiteBest < maroonBest) whiteHoles++;
  }

  const holesRemaining = 18 - completed;
  const margin = Math.abs(maroonHoles - whiteHoles);
  const leader: Team | "tie" = maroonHoles > whiteHoles ? "maroon" : whiteHoles > maroonHoles ? "white" : "tie";

  const matchClosed = completed === 18 || margin > holesRemaining;
  let maroonPts = 0;
  let whitePts = 0;
  if (matchClosed) {
    if (maroonHoles > whiteHoles) maroonPts = 1;
    else if (whiteHoles > maroonHoles) whitePts = 1;
    else {
      maroonPts = 0.5;
      whitePts = 0.5;
    }
  }

  return { maroonPts, whitePts, leader, margin, holesRemaining };
}

export function matchBoxPayload(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, now?: Date): Record<string, unknown> {
  const state = effectiveMatchState(snapshot, matchBox, now);
  const result = matchBoxResult(snapshot, matchBox);
  return {
    id: matchBox.id,
    year: matchBox.tournamentYear,
    day: matchBox.day,
    round: matchBoxRound(matchBox),
    session: matchBox.session,
    boxNumber: matchBox.boxNumber,
    format: matchBox.format,
    teeTime: matchBox.teeTime.toISOString(),
    state,
    thru: state === "Scheduled" ? "" : thruLabel(snapshot, matchBox),
    maroonPlayers: matchBox.maroonPlayers,
    whitePlayers: matchBox.whitePlayers,
    ...result,
  };
}
