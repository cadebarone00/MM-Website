/** Reindex golf-day records while preserving their calendar dates, including hidden days. */
export function shiftScheduleDays<T>(values: Record<string, T>, offset: number): Record<string, T> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const match = /^(-?\d+)(-\d+)?$/.exec(key);
    return [match ? `${Number(match[1]) + offset}${match[2] ?? ""}` : key, value];
  }));
}

/** Delete one round and close its slot gap without changing other days. */
export function removeScheduleSlot<T>(values: Record<string, T>, day: number, slot: number): Record<string, T> {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
    const match = /^(-?\d+)-(\d+)$/.exec(key);
    if (!match || Number(match[1]) !== day) return [[key, value]];
    const at = Number(match[2]);
    return at === slot ? [] : [[`${day}-${at > slot ? at - 1 : at}`, value]];
  }));
}
