// lib/broadcast/rules.ts
//
// One pure function per raw event kind -> BroadcastEventDraft. No I/O.
// Matches lib/live/scoring.ts's style. Priority numbers and expiration
// defaults per the master spec's §13 (overlay-class: 10 min, takeover-class: 30 min).
import { DEFAULT_PRIORITIES } from "./priority";
import type {
  BroadcastEventDraft,
  RawMatchStateChangedEvent,
  RawMatchWonEvent,
  RawRoundFinalEvent,
  RawRoundStartedEvent,
  RawScorePostedEvent,
} from "./types";

const OVERLAY_EXPIRES_MS = 10 * 60 * 1000;
const TAKEOVER_EXPIRES_MS = 30 * 60 * 1000;

function expiresAt(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

export function scorePostedRule(event: RawScorePostedEvent, now: Date = new Date()): BroadcastEventDraft {
  void now;
  return {
    priority: DEFAULT_PRIORITIES.SCORE_POSTED,
    status: "pending",
    expiresAt: null,
    payload: { playerSlug: event.playerSlug, round: event.round, hole: event.hole, score: event.score, matchBoxId: event.matchBoxId },
  };
}

export function matchStateChangedRule(event: RawMatchStateChangedEvent, now: Date = new Date()): BroadcastEventDraft {
  return {
    priority: DEFAULT_PRIORITIES.MATCH_STATE_CHANGED,
    status: "queued",
    expiresAt: expiresAt(now, OVERLAY_EXPIRES_MS),
    payload: { matchBoxId: event.matchBoxId, round: event.round, leader: event.leader, margin: event.margin, holesRemaining: event.holesRemaining },
  };
}

export function matchWonRule(event: RawMatchWonEvent, now: Date = new Date()): BroadcastEventDraft {
  return {
    priority: DEFAULT_PRIORITIES.MATCH_WON,
    status: "queued",
    expiresAt: expiresAt(now, TAKEOVER_EXPIRES_MS),
    payload: { matchBoxId: event.matchBoxId, round: event.round, leader: event.leader, margin: event.margin, maroonPts: event.maroonPts, whitePts: event.whitePts },
  };
}

export function roundStartedRule(event: RawRoundStartedEvent, now: Date = new Date()): BroadcastEventDraft {
  void now;
  return { priority: DEFAULT_PRIORITIES.ROUND_STARTED, status: "pending", expiresAt: null, payload: { round: event.round } };
}

export function roundFinalRule(event: RawRoundFinalEvent, now: Date = new Date()): BroadcastEventDraft {
  return { priority: DEFAULT_PRIORITIES.ROUND_FINAL, status: "queued", expiresAt: expiresAt(now, TAKEOVER_EXPIRES_MS), payload: { round: event.round } };
}
