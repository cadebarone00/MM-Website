/** Settings → Privacy. Private: only you see your Rounds; people you play with still see your handicap index (games need it). */
export type RoundsVisibility = "public" | "private";
export const DEFAULT_ROUNDS_VISIBILITY: RoundsVisibility = "private";

export function profileAccess({ viewerId, ownerId, visibility, playTogether }: {
  viewerId: string; ownerId: string; visibility: RoundsVisibility; playTogether: boolean;
}): { rounds: boolean; handicapIndex: boolean } {
  if (viewerId === ownerId || visibility === "public") return { rounds: true, handicapIndex: true };
  return { rounds: false, handicapIndex: playTogether };
}

/** Settings → Privacy request body ({ visibility }) → the choice, or null if it isn't one. */
export function roundsVisibilityFromBody(body: unknown): RoundsVisibility | null {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).visibility : undefined;
  return value === "public" || value === "private" ? value : null;
}
