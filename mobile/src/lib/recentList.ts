/** "Recent" lists on search screens (website components/search/recents.ts): newest first, at most 8, one per id. */
export const RECENT_MAX = 8;

export function addRecent<T extends { id: string }>(list: T[], item: T): T[] {
  return [item, ...list.filter((entry) => entry.id !== item.id)].slice(0, RECENT_MAX);
}

/** Remove one (by id), or clear all with null. */
export function removeRecent<T extends { id: string }>(list: T[], id: string | null): T[] {
  return id === null ? [] : list.filter((entry) => entry.id !== id);
}

/** Read a saved list safely: bad or missing data = an empty list. */
export function readRecentList<T extends { id: string }>(text: string | null, isItem: (value: unknown) => value is T): T[] {
  try {
    const list = JSON.parse(text ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter(isItem).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
