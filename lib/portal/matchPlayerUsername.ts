export interface PlayerSlotRow {
  player_slug: string;
  username: string | null;
  claimed_by: string | null;
}

/**
 * Finds the still-open player_slots row a freshly-typed sign-up username
 * matches, if any. Used only server-side (Task 5) against rows fetched with
 * the service-role client — player_slots is never readable from the browser.
 */
export function findUnclaimedSlotForUsername(username: string, slots: PlayerSlotRow[]): PlayerSlotRow | null {
  const needle = username.trim().toLowerCase();
  return slots.find((slot) => slot.username !== null && slot.claimed_by === null && slot.username.toLowerCase() === needle) ?? null;
}
