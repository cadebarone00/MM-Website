export type GroupStarts = Record<number, string>;
/** Scheduled tee times never establish actual play. Closing a round does not undo its start. */
export function roundHasStarted(groups: GroupStarts = {}, entry?: { openedAt?: string }, sourceStarted = false): boolean {
  return Object.keys(groups).length > 0 || Boolean(entry?.openedAt) || sourceStarted;
}
/** A legacy whole-round start has no finer group evidence, so all existing groups are protected. */
export function groupHasStarted(group: number, groups: GroupStarts = {}, entry?: { openedAt?: string }, sourceStarted = false): boolean {
  return Boolean(groups[group]) || (Object.keys(groups).length === 0 && (Boolean(entry?.openedAt) || sourceStarted));
}
