/**
 * Deterministically derives a player's reserved sign-up username from their
 * full name: "MM" + first 3 letters of their first name + first 3 letters
 * of their last name, uppercase. E.g. "Collin Ross" -> "MMCOLROS". Applies
 * to any player, current or future — there is no manual assignment step.
 */
export function computePlayerUsername(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const firstPart = first.slice(0, 3).toUpperCase();
  const lastPart = last.slice(0, 3).toUpperCase();
  return `MM${firstPart}${lastPart}`;
}
