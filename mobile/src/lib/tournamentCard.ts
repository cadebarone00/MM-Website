/** Compare server-saved player and attester entries without treating missing scores as matches. */
export function tournamentHoleStatus(own: number | null, attested: number | null, hasAttester: boolean): "empty" | "waiting" | "match" | "mismatch" | "recorded" {
  if (!hasAttester) return own === null ? "empty" : "recorded";
  if (own === null && attested === null) return "empty";
  if (own === null || attested === null) return "waiting";
  return own === attested ? "match" : "mismatch";
}

/** Identifies the exact tournament, round, hole and person an unsaved entry belongs to. */
export function tournamentEntryScope(tournamentId: string, round: number, hole: number, mode: "own" | "attest", playerId: string | null): string {
  return JSON.stringify([tournamentId, round, hole, mode, playerId]);
}
