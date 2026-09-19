/**
 * Deterministically derives a URL-safe, join-safe slug from a player's
 * full name — the same "any player, current or future" spirit as
 * computePlayerUsername. Not guaranteed unique on its own (two "John
 * Smith"s collide); callers append a numeric suffix on conflict.
 */
export function computePlayerSlug(fullName: string): string {
  return fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
