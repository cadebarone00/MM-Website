const MAX_LENGTH = 40;

/** Cleans up a team name typed into the draft screen: trims whitespace, caps length, and turns a blank entry into null so callers can fall back to a default. */
export function sanitizeTeamName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/** What the leaderboard shows for a team that was never given a name. */
export function defaultTeamName(displayName: string): string {
  return `${displayName}'s Team`;
}
