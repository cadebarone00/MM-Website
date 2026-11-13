/** Tap In links reuse the trip's existing read-only watch capability, never its player invite. */
export function tapInPath(code: string | null | undefined): string | null {
  const normalized = (code ?? "").trim().toUpperCase().replace(/-/g, "");
  return /^W[A-Z0-9]{5}$/.test(normalized) ? `/tap-in/${normalized}` : null;
}

export function homeRosterFull(joined: number, allotted: number | null, teamsComplete: boolean): boolean {
  return teamsComplete || (allotted !== null && allotted > 0 && joined >= allotted);
}
