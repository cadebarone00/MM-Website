type PlayerIdentity = { id: string; slug: string; fullName: string };

const nameKey = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Exact IDs take precedence; a shortened name must identify exactly one player. */
export function createPlayerResolver<T extends PlayerIdentity>(players: T[]) {
  const ids = new Map<string, T>();
  const names = new Map<string, Map<string, T>>();
  for (const player of players) {
    ids.set(nameKey(player.id), player);
    ids.set(nameKey(player.slug), player);
    const fullName = nameKey(player.fullName);
    const parts = fullName.split(" ");
    for (const alias of [fullName, parts[0], parts.at(-1)!]) {
      const matches = names.get(alias) ?? new Map<string, T>();
      matches.set(player.slug, player);
      names.set(alias, matches);
    }
  }
  return (input: string): T | undefined => {
    const key = nameKey(input);
    const exact = ids.get(key);
    if (exact) return exact;
    const matches = names.get(key);
    return matches?.size === 1 ? matches.values().next().value : undefined;
  };
}
