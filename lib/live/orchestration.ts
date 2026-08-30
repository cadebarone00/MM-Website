import { readScore, type LiveMatchBox, type LiveTournamentSnapshot, type MatchFormat, type MatchState, type Team } from "./types.ts";

const ROSTER_SIZE = 12; // 6 Maroon + 6 White — fixed roster size across formats

export function boxesPerRound(format: MatchFormat): number {
  return format === "Singles" ? 6 : 3;
}

export function playersPerTeamPerBox(format: MatchFormat): number {
  return format === "Singles" ? 1 : 2;
}

export function validateMatchBox(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): string[] {
  const errors: string[] = [];
  const maxBoxes = boxesPerRound(matchBox.format);
  if (matchBox.boxNumber < 1 || matchBox.boxNumber > maxBoxes) {
    errors.push(`Match box must be between 1 and ${maxBoxes} for ${matchBox.format}.`);
  }

  const perTeam = playersPerTeamPerBox(matchBox.format);
  if (matchBox.maroonPlayers.length !== perTeam) errors.push(`Pick exactly ${perTeam} Maroon player${perTeam === 1 ? "" : "s"}.`);
  if (matchBox.whitePlayers.length !== perTeam) errors.push(`Pick exactly ${perTeam} White player${perTeam === 1 ? "" : "s"}.`);

  for (const player of matchBox.maroonPlayers) {
    if (snapshot.players[player]?.team !== "maroon") errors.push(`${player} is not on Team Maroon.`);
  }
  for (const player of matchBox.whitePlayers) {
    if (snapshot.players[player]?.team !== "white") errors.push(`${player} is not on Team White.`);
  }

  const roundBoxes = snapshot.matchBoxes.filter((box) => box.round === matchBox.round && box.boxNumber !== matchBox.boxNumber);
  const used = new Set(roundBoxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]));
  const duplicates = [...matchBox.maroonPlayers, ...matchBox.whitePlayers].filter((player) => used.has(player));
  if (duplicates.length > 0) errors.push(`Players already assigned in this round: ${[...new Set(duplicates)].sort().join(", ")}.`);

  return errors;
}

/**
 * Whether `scorerSlug` is allowed to enter `targetSlugs`' shared stroke
 * count for a hole in this match box. Fourball/Singles: `scorerSlug` and
 * the sole entry in `targetSlugs` must be the direct opposing pair at the
 * same box position (maroonPlayers[i] <-> whitePlayers[i] — Tiger already
 * sets this just by the order players are picked in Matchups). Foursome:
 * `targetSlugs` must be exactly the whole opposing side (either player on
 * your side may enter it, since it's one shared real-world number).
 */
export function canScoreStrokesFor(
  matchBox: Pick<LiveMatchBox, "format" | "maroonPlayers" | "whitePlayers">,
  scorerSlug: string,
  targetSlugs: string[]
): boolean {
  const onMaroon = matchBox.maroonPlayers.includes(scorerSlug);
  const onWhite = matchBox.whitePlayers.includes(scorerSlug);
  if (!onMaroon && !onWhite) return false;

  const opposingSide = onMaroon ? matchBox.whitePlayers : matchBox.maroonPlayers;

  if (matchBox.format === "Foursome") {
    return targetSlugs.length === opposingSide.length && opposingSide.every((slug) => targetSlugs.includes(slug));
  }

  const ownSide = onMaroon ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const position = ownSide.indexOf(scorerSlug);
  const expectedTarget = opposingSide[position];
  return targetSlugs.length === 1 && targetSlugs[0] === expectedTarget;
}

export function roundIsComplete(snapshot: LiveTournamentSnapshot, round: number, format: MatchFormat): boolean {
  const boxes = snapshot.matchBoxes.filter((box) => box.round === round);
  if (boxes.length !== boxesPerRound(format)) return false;
  const players = boxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]);
  return players.length === ROSTER_SIZE && new Set(players).size === ROSTER_SIZE;
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
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];
  return players.every((player) => {
    const score = readScore(snapshot, player, matchBox.round, hole);
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
  const round = matchBox.round;
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
    round: matchBox.round,
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
