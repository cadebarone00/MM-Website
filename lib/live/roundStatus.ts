// lib/live/roundStatus.ts
import { holeSubmissionStatus, scoringSides, submittedPair, type HoleSubmission, type HoleSubmissionStatus, type ScoringPair } from "./holeSubmission.ts";

/** White = data missing, red = a hole disagrees, green = every hole matches. */
export type RoundCardState = "waiting" | "disputed" | "match";
export interface RoundBlocker { kind: "disputed" | "empty" | "waiting"; hole: number }

export interface LiveRoundStatus {
  state: RoundCardState;
  holeStates: Record<number, HoleSubmissionStatus>;
  disputedHoles: number[];
  /** Your own score and your opponent's score are judged separately, so you can see whose score disagrees. */
  yourState: RoundCardState;
  opponentState: RoundCardState;
  yourDisputedHoles: number[];
  opponentDisputedHoles: number[];
  /** The first reason Submit Round is unavailable, or null once the card matches. */
  blocker: RoundBlocker | null;
  /** Totals of your own entries; null until you have entered every hole. */
  yourTotal: number | null;
  opponentTotal: number | null;
}

/** Everyone who must press Submit Round before this player's round is official. */
export function requiredSubmitters(box: ScoringPair, player: string): string[] {
  if (box.format === "Foursome") return [...box.maroonPlayers, ...box.whitePlayers];
  return [player, ...scoringSides(box, player).opponents];
}

export function waitingOnSubmitters(box: ScoringPair, player: string, submitted: string[]): string[] {
  return requiredSubmitters(box, player).filter((slug) => !submitted.includes(slug));
}

export function roundFinishedForPlayer(box: ScoringPair, player: string, submitted: string[]): boolean {
  return waitingOnSubmitters(box, player, submitted).length === 0;
}

export function liveRoundStatus(box: ScoringPair, player: string, holes: { number: number }[], submissions: HoleSubmission[]): LiveRoundStatus {
  const numbers = holes.map((hole) => hole.number);
  const holeStates: Record<number, HoleSubmissionStatus> = {};
  const mine: HoleSubmission[] = [];
  const yourDisputedHoles: number[] = [];
  const opponentDisputedHoles: number[] = [];
  let compared = 0;
  for (const number of numbers) {
    holeStates[number] = holeSubmissionStatus(box, player, number, submissions);
    const pair = submittedPair(box, player, number, submissions);
    if (pair.mine) mine.push(pair.mine);
    if (pair.mine && pair.other) {
      compared++;
      if (pair.mine.ownScore !== pair.other.opponentScore) yourDisputedHoles.push(number);
      if (pair.mine.opponentScore !== pair.other.ownScore) opponentDisputedHoles.push(number);
    }
  }
  const personState = (disputed: number[]): RoundCardState => (disputed.length > 0 ? "disputed" : numbers.length > 0 && compared === numbers.length ? "match" : "waiting");
  const disputedHoles = numbers.filter((number) => holeStates[number] === "disputed");
  const allConfirmed = numbers.length > 0 && numbers.every((number) => holeStates[number] === "confirmed");
  const state: RoundCardState = disputedHoles.length > 0 ? "disputed" : allConfirmed ? "match" : "waiting";

  let blocker: RoundBlocker | null = null;
  if (disputedHoles.length > 0) blocker = { kind: "disputed", hole: disputedHoles[0] };
  else if (!allConfirmed) {
    const empty = numbers.find((number) => holeStates[number] === "empty");
    const waiting = numbers.find((number) => holeStates[number] === "submitted");
    blocker = empty != null ? { kind: "empty", hole: empty } : waiting != null ? { kind: "waiting", hole: waiting } : null;
  }

  const entered = numbers.length > 0 && mine.length === numbers.length;
  return {
    state,
    holeStates,
    disputedHoles,
    yourState: personState(yourDisputedHoles),
    opponentState: personState(opponentDisputedHoles),
    yourDisputedHoles,
    opponentDisputedHoles,
    blocker,
    yourTotal: entered ? mine.reduce((sum, entry) => sum + entry.ownScore, 0) : null,
    opponentTotal: entered ? mine.reduce((sum, entry) => sum + entry.opponentScore, 0) : null,
  };
}

export function describeBlocker(blocker: RoundBlocker | null, scorerLabel: string): string | null {
  if (!blocker) return null;
  if (blocker.kind === "disputed") return `Hole ${blocker.hole} doesn't match — talk with ${scorerLabel}`;
  if (blocker.kind === "empty") return `Hole ${blocker.hole} is not entered`;
  return `Waiting for ${scorerLabel} to enter hole ${blocker.hole}`;
}
