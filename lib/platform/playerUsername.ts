/**
 * A player's @username for display. Until real usernames exist, players without one get a made-up placeholder from
 * their name ("Tiger Woods" → "tigerwoods37"). The number comes from the name, so it's the same every time and on every
 * screen (Trip Home's Players list and the Golf tab's Individual leaderboard). Safe to import anywhere.
 */
export function placeholderUsername(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "player";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return `${base}${(hash % 90) + 10}`;
}

/** "@username": the real one when the player has it, otherwise the placeholder. */
export const shownUsername = (name: string, username?: string | null) => `@${username || placeholderUsername(name)}`;
