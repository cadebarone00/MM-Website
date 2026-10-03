// One-shot, in-memory intent: no URL changes, persistence or navigation interception.
let startedAt: number | null = null;

export function beginJoinTournamentTransition() {
  startedAt = Date.now();
}

export function consumeJoinTournamentTransition() {
  const started = startedAt;
  startedAt = null;
  return started !== null && Date.now() - started < 30_000;
}
